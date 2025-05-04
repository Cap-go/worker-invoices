/**
 * Utility functions for interacting with the Stripe API
 */

import Stripe from 'stripe';

// Initialize Stripe with API key from environment
let stripe: Stripe | null = null;

function initStripe(apiKey: string) {
  if (!stripe) {
    stripe = new Stripe(apiKey, {
      apiVersion: '2025-04-30.basil',
      typescript: true,
    });
  }
  return stripe;
}

/**
 * Type definition for company information
 */
export interface CompanyInfo {
  name: string;
  address: string;
  email: string;
  logo: string;
  vatId: string;
  brandColor: string;
  secondaryColor: string;
  description: string;
}

/**
 * Type definition for customer address
 */
export interface CustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

/**
 * Type definition for customer data
 */
export interface CustomerData {
  name: string;
  email: string;
  address?: CustomerAddress;
  vatId: string;
}

/**
 * Type definition for charge data
 */
export interface ChargeData {
  amount: number;
  price_string: string;
  currency: string;
  description: string;
  payment_method_details: {
    type: string;
    card: {
      brand: string;
      last4: string;
    };
  };
  created: number;
  id: string;
}

/**
 * Type definition for subscription information
 */
export interface SubscriptionInfo {
  id: string;
  planName: string;
  interval: string;
  amount: number;
  price_string: string;
  currency: string;
  details: string;
  current_period_start: number;
  current_period_end: number;
  items?: {
    data: Array<{
      current_period_start: number;
      current_period_end: number;
    }>;
  };
}

/**
 * Fetches customer data from Stripe
 * @param c The context object containing environment variables
 * @param customerId The ID of the customer to fetch
 * @returns Customer data with name and email
 */
export async function getCustomerData(c: any, customerId: string): Promise<CustomerData> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  const customer = await stripeClient.customers.retrieve(customerId);
  if (!customer || customer.deleted) {
    throw new Error('Customer not found or deleted');
  }
  const taxId = customer.tax_ids?.data[0].value;
  return {
    name: customer.name || 'Unknown',
    email: customer.email || 'Unknown',
    address: customer.address as CustomerAddress || undefined,
    vatId: taxId ? await getFormattedVatNumber(c, taxId) : 'Unknown',
  };
}

/**
 * Fetches company information from Stripe
 * @param c The context object containing environment variables
 * @returns Company information
 */
export async function getCompanyInfo(c: any): Promise<CompanyInfo> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  const account = await stripeClient.accounts.retrieve();
  let companyInfo: CompanyInfo = { 
    name: 'Not Set', 
    address: 'Not Set', 
    email: 'Not Set', 
    vatId: '', 
    brandColor: '#4f46e5', 
    logo: '', 
    secondaryColor: '#f3f4f6',
    description: 'Automatic updates for Capacitor apps'
  };

  companyInfo.name = account.business_profile?.name || 'Not Set';
  companyInfo.address = (account.business_profile?.support_address && account.country) ? 
    `${account.business_profile.support_address.line1}, ${account.business_profile?.support_address?.line2 || ''}, ${account.business_profile.support_address.city}, ${account.business_profile.support_address.postal_code}, ${getCountryName(account.business_profile.support_address.country || 'US')}` : 'Not Set';
  companyInfo.email = account.business_profile?.support_email || 'Not Set';
  companyInfo.brandColor = account.settings?.branding?.primary_color || '#4f46e5';
  companyInfo.secondaryColor = account.settings?.branding?.secondary_color || '#f3f4f6';
  companyInfo.description = account.business_profile?.product_description || 'Automatic updates for Capacitor apps';
  
  // Get and format VAT number
  if (account.settings?.invoices?.default_account_tax_ids && account.settings.invoices.default_account_tax_ids.length > 0) {
    const taxId = account.settings.invoices.default_account_tax_ids[0];
    companyInfo.vatId = await getFormattedVatNumber(c, typeof taxId === 'string' ? taxId : taxId.id);
  }
  
  // Get and process logo URL
  if (account.settings?.branding?.logo) {
    companyInfo.logo = await getLogoUrl(c, typeof account.settings.branding.logo === 'string' ? account.settings.branding.logo : account.settings.branding.logo.id);
  }
  
  return companyInfo;
}

/**
 * Fetches and formats a Stripe Tax ID
 * Converts a Stripe tax ID reference (txi_xxx) to the actual VAT number
 */
export async function getFormattedVatNumber(c: any, taxId: string): Promise<string> {
  if (!taxId) return '';
  
  // If it's a tax ID reference, fetch the actual tax ID object
  if (taxId && taxId.startsWith('txi_')) {
    try {
      const stripeClient = initStripe(c.env.STRIPE_API_KEY);
      const taxIdObject = await stripeClient.taxIds.retrieve(taxId);
      if (taxIdObject.value) {
        let formattedVat = taxIdObject.value;
        
        // Ensure correct format if needed
        if (taxIdObject.country && !formattedVat.startsWith(taxIdObject.country)) {
          formattedVat = taxIdObject.country + formattedVat;
        }
        
        return formattedVat;
      }
    } catch (error) {
      console.error('Error fetching tax ID details:', error);
    }
  }
  
  // Fallback to original value if anything fails
  return taxId;
}

/**
 * Fetches and processes a Stripe logo URL
 * Converts a Stripe file ID to a public URL using file_links
 */
export async function getLogoUrl(c: any, fileId: string): Promise<string> {
  if (!fileId) return '';
  
  // Check if it's a full URL already
  if (fileId.startsWith('http')) {
    return fileId;
  }
  
  // It's a file ID, format it as a Stripe File URL
  try {
    // First check if a file link already exists
    const stripeClient = initStripe(c.env.STRIPE_API_KEY);
    const fileLinks = await stripeClient.fileLinks.list({
      file: fileId,
      limit: 1,
    });
    
    if (fileLinks.data.length > 0) {
      // Use existing file link
      return fileLinks.data[0].url || '';
    } else {
      // Create a new file link
      const fileLink = await stripeClient.fileLinks.create({
        file: fileId,
      });
      
      return fileLink.url || '';
    }
  } catch (error) {
    console.error('Error handling logo file:', error);
  }
  
  // Fallback to constructing a URL using the file ID
  return `https://files.stripe.com/links/${fileId}`;
}

/**
 * Fetches subscription information from Stripe
 * Returns formatted subscription details
 */
export async function getSubscriptionInfo(c: any, customerId: string, chargeId?: string): Promise<SubscriptionInfo | null> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  try {
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 5,
    });

    if (subscriptions.data.length > 0) {
      // Simply return the first active subscription since detailed date matching is not feasible with current API
      return await getSubscriptionDetailsFromId(c, subscriptions.data[0].id);
    }
  } catch (error) {
    console.error('Error fetching subscription information:', error);
  }
  return null;
}

/**
 * Helper function to get subscription details from a subscription ID
 * Fetches price and product information
 */
async function getSubscriptionDetailsFromId(c: any, subscriptionId: string): Promise<SubscriptionInfo | null> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  try {
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });
    
    if (!subscription) {
      return null;
    }
    
    // Get plan name from product
    let planName = 'Unknown Plan';
    if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0].price && subscription.items.data[0].price.product && typeof subscription.items.data[0].price.product !== 'string' && 'name' in subscription.items.data[0].price.product) {
      planName = subscription.items.data[0].price.product.name || 'Unknown Plan';
    }
    
    // Get interval from price
    let interval = 'month';
    if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0].price && subscription.items.data[0].price.recurring) {
      interval = subscription.items.data[0].price.recurring.interval || 'month';
    }
    
    // Get amount and currency from price
    let amount = 0;
    let currency = 'usd';
    if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0].price) {
      amount = subscription.items.data[0].price.unit_amount || 0;
      currency = subscription.items.data[0].price.currency || 'usd';
    }
    
    // Format price string
    const price_string = formatCurrency(amount, currency);
    
    // Get billing period from subscription item if available
    let current_period_start = subscription.start_date || Math.floor(Date.now() / 1000);
    let current_period_end = Math.floor(Date.now() / 1000);
    
    if (subscription.items && subscription.items.data.length > 0) {
      const item = subscription.items.data[0];
      if (item.current_period_start) {
        current_period_start = item.current_period_start;
      }
      if (item.current_period_end) {
        current_period_end = item.current_period_end;
      }
    }
    
    return {
      id: subscription.id,
      planName,
      interval,
      amount,
      price_string,
      currency,
      details: subscription.description || '',
      current_period_start,
      current_period_end,
      items: subscription.items as any,
    };
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    return null;
  }
}

/**
 * Converts a Stripe country code to a full country name
 */
function getCountryName(countryCode: string): string {
  const countryMap: Record<string, string> = {
    'AU': 'Australia',
    'AT': 'Austria',
    'BE': 'Belgium',
    'BR': 'Brazil',
    'BG': 'Bulgaria',
    'CA': 'Canada',
    'HR': 'Croatia',
    'CY': 'Cyprus',
    'CZ': 'Czech Republic',
    'DK': 'Denmark',
    'EE': 'Estonia',
    'FI': 'Finland',
    'FR': 'France',
    'DE': 'Germany',
    'GI': 'Gibraltar',
    'GR': 'Greece',
    'HK': 'Hong Kong',
    'HU': 'Hungary',
    'IN': 'India',
    'ID': 'Indonesia',
    'IE': 'Ireland',
    'IT': 'Italy',
    'JP': 'Japan',
    'LV': 'Latvia',
    'LI': 'Liechtenstein',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'MY': 'Malaysia',
    'MT': 'Malta',
    'MX': 'Mexico',
    'NL': 'Netherlands',
    'NZ': 'New Zealand',
    'NO': 'Norway',
    'PL': 'Poland',
    'PT': 'Portugal',
    'RO': 'Romania',
    'SG': 'Singapore',
    'SK': 'Slovakia',
    'SI': 'Slovenia',
    'ES': 'Spain',
    'SE': 'Sweden',
    'CH': 'Switzerland',
    'TH': 'Thailand',
    'AE': 'United Arab Emirates',
    'GB': 'United Kingdom',
    'US': 'United States'
  };
  const countryName = countryMap[countryCode] || countryCode;
  console.log('Country name:', countryName);
  console.log('Country code:', countryCode);
  return countryName;
}

/**
 * Fetches charges for a customer from Stripe
 * @param c The context object containing environment variables
 * @param customerId The ID of the customer to fetch charges for
 * @returns Array of charge objects
 */
export async function getCustomerCharges(c: any, customerId: string): Promise<Array<ChargeData>> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  const charges = await stripeClient.charges.list({
    customer: customerId,
    limit: 100,
  });

  return charges.data.map((charge) => ({
    id: charge.id,
    amount: charge.amount,
    // tax_amount: charge.,
    created: charge.created,
    price_string: formatCurrency(charge.amount, charge.currency),
    currency: charge.currency,
    description: charge.description || 'No description',
    payment_method_details: charge.payment_method_details as { type: string; card: { brand: string; last4: string } },
  }));
}

/**
 * Fetches a specific charge from Stripe
 * @param c The context object containing environment variables
 * @param chargeId The ID of the charge to fetch
 * @returns Charge data
 */
export async function getChargeData(c: any, chargeId: string): Promise<ChargeData> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  const charge = await stripeClient.charges.retrieve(chargeId);
  return {
    id: charge.id,
    amount: charge.amount,
    created: charge.created,
    price_string: formatCurrency(charge.amount, charge.currency),
    currency: charge.currency,
    description: charge.description || 'No description',
    payment_method_details: charge.payment_method_details as { type: string; card: { brand: string; last4: string } },
  };
}

/**
 * Creates a billing portal session for a customer
 * @param c The context object containing environment variables
 * @param customerId The ID of the customer
 * @param returnUrl The URL to return to after the billing portal
 * @returns The URL of the billing portal session
 */
export async function createBillingPortalSession(c: any, customerId: string, returnUrl: string): Promise<string> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  const session = await stripeClient.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Fetches Stripe webhook endpoints
 * @param c The context object containing environment variables
 * @returns Array of webhook endpoint objects
 */
export async function getWebhookEndpoints(c: any): Promise<Array<any>> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  const endpoints = await stripeClient.webhookEndpoints.list();
  return endpoints.data;
}

/**
 * Deletes a Stripe webhook endpoint
 * @param c The context object containing environment variables
 * @param webhookId The ID of the webhook to delete
 * @returns Promise indicating success or failure
 */
export async function deleteWebhookEndpoint(c: any, webhookId: string): Promise<void> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  await stripeClient.webhookEndpoints.del(webhookId);
}

/**
 * Creates a Stripe webhook endpoint
 * @param c The context object containing environment variables
 * @param url The URL for the webhook
 * @param events The events to enable for the webhook
 * @returns The created webhook object
 */
export async function createWebhookEndpoint(c: any, url: string, events: string[]): Promise<any> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  return await stripeClient.webhookEndpoints.create({
    url,
    enabled_events: events as any,
  });
}

/**
 * Fetches Stripe account information
 * @param c The context object containing environment variables
 * @returns Account information
 */
export async function getAccountInfo(c: any): Promise<any> {
  const stripeClient = initStripe(c.env.STRIPE_API_KEY);
  return await stripeClient.accounts.retrieve();
}

export const formatCurrency = (amount: number, currency = "usd") => {
  const currencySymbol = getCurrencySymbol(currency)
  return `${currencySymbol}${(amount / 100).toFixed(2)}`
}

/**
 * Converts a Stripe currency code to its real currency symbol
 * @param currencyCode The Stripe currency code (e.g., 'usd', 'eur')
 * @returns The corresponding currency symbol (e.g., '$', '€')
 */
export function getCurrencySymbol(currencyCode: string): string {
  const currencyMap: Record<string, string> = {
    'usd': '$',
    'eur': '€',
    'gbp': '£',
    'jpy': '¥',
    'aud': 'A$',
    'cad': 'C$',
    'chf': 'CHF',
    'cny': '¥',
    'hkd': 'HK$',
    'nzd': 'NZ$',
    'sek': 'kr',
    'krw': '₩',
    'sgd': 'S$',
    'nok': 'kr',
    'mxn': '$',
    'inr': '₹',
    'rub': '₽',
    'zar': 'R',
    'try': '₺',
    'brl': 'R$',
    'twd': 'NT$',
    'dkk': 'kr',
    'pln': 'zł',
    'thb': '฿',
    'idr': 'Rp',
    'huf': 'Ft',
    'czk': 'Kč',
    'ils': '₪',
    'clp': '$',
    'php': '₱',
    'aed': 'د.إ',
    'cop': '$',
    'sar': '﷼',
    'myr': 'RM',
    'ron': 'lei'
  };
  return currencyMap[currencyCode.toLowerCase()] || currencyCode.toUpperCase();
}

/**
 * Calculates the period end date based on billing cycle anchor and interval
 * @param billingCycleAnchor The timestamp of the billing cycle anchor
 * @param interval The subscription interval (day, week, month, year)
 * @returns The calculated period end timestamp
 */
function calculatePeriodEnd(billingCycleAnchor: number, interval: string): number {
  const anchorDate = new Date(billingCycleAnchor * 1000);
  let endDate: Date;
  
  switch (interval) {
    case 'day':
      endDate = new Date(anchorDate.setDate(anchorDate.getDate() + 1));
      break;
    case 'week':
      endDate = new Date(anchorDate.setDate(anchorDate.getDate() + 7));
      break;
    case 'month':
      endDate = new Date(anchorDate.setMonth(anchorDate.getMonth() + 1));
      break;
    case 'year':
      endDate = new Date(anchorDate.setFullYear(anchorDate.getFullYear() + 1));
      break;
    default:
      endDate = new Date(anchorDate.setMonth(anchorDate.getMonth() + 1)); // Default to month
      break;
  }
  
  return Math.floor(endDate.getTime() / 1000);
}
