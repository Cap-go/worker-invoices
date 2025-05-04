/**
 * Utility functions for interacting with the Stripe API
 */

/**
 * Type definition for company information
 */
export interface CompanyInfo {
  name: string;
  address: string;
  email: string;
  logo: string;
  vatId: string;
  vat: string;
  brandColor: string;
  secondaryColor: string;
  description: string;
}

/**
 * Type definition for customer address
 */
export interface CustomerAddress {
  line1?: string;
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
}

/**
 * Type definition for charge data
 */
export interface ChargeData {
  amount: number;
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
  amount: string;
  currency: string;
}

/**
 * Fetches customer data from Stripe
 * @param c The context object containing environment variables
 * @param customerId The ID of the customer to fetch
 * @returns Customer data with name and email
 */
export async function getCustomerData(c: any, customerId: string): Promise<any> {
  const customerResponse = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!customerResponse.ok) {
    throw new Error('Failed to fetch customer data');
  }

  return await customerResponse.json();
}

/**
 * Fetches company information from Stripe
 * @param c The context object containing environment variables
 * @returns Company information
 */
export async function getCompanyInfo(c: any): Promise<CompanyInfo> {
  let companyInfo: CompanyInfo = { 
    name: 'Not Set', 
    address: 'Not Set', 
    email: 'Not Set', 
    vat: 'Not Set',
    vatId: '', 
    brandColor: '#4f46e5', 
    logo: '', 
    secondaryColor: '#f3f4f6',
    description: 'Automatic updates for Capacitor apps'
  };

  try {
    const accountResponse = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (accountResponse.ok) {
      const accountData = await accountResponse.json() as any;
      
      companyInfo.name = accountData.business_profile?.name || 'Not Set';
      companyInfo.address = (accountData.business_profile?.support_address && accountData.country) ? 
        `${accountData.business_profile.support_address.line1}, ${accountData.business_profile.support_address.city}, ${accountData.business_profile.support_address.postal_code}, ${getCountryName(accountData.business_profile.support_address.country)}` : 'Not Set';
      companyInfo.email = accountData.business_profile?.support_email || 'Not Set';
      companyInfo.brandColor = accountData.settings?.branding?.primary_color || '#4f46e5';
      companyInfo.secondaryColor = accountData.settings?.branding?.secondary_color || '#f3f4f6';
      companyInfo.description = accountData.business_profile?.product_description || 'Automatic updates for Capacitor apps';
      
      // Get and format VAT number
      if (accountData.settings?.invoices?.default_account_tax_ids?.length > 0) {
        companyInfo.vat = 'Set';
        const taxId = accountData.settings.invoices.default_account_tax_ids[0] || '';
        companyInfo.vatId = await getFormattedVatNumber(c, taxId);
      }
      
      // Get and process logo URL
      if (accountData.settings?.branding?.logo) {
        companyInfo.logo = await getLogoUrl(c, accountData.settings.branding.logo);
      }
    } else {
      console.error('Account check failed with status:', accountResponse.status);
      console.error('Account check response:', await accountResponse.text());
    }
  } catch (error) {
    console.error('Error fetching company info:', error);
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
      const taxIdResponse = await fetch(`https://api.stripe.com/v1/tax_ids/${taxId}`, {
        headers: {
          'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (taxIdResponse.ok) {
        const taxIdData = await taxIdResponse.json() as any;
        if (taxIdData.value) {
          let formattedVat = taxIdData.value;
          
          // Ensure correct format if needed
          if (taxIdData.country && !formattedVat.startsWith(taxIdData.country)) {
            formattedVat = taxIdData.country + formattedVat;
          }
          
          return formattedVat;
        }
      } else {
        console.error('Failed to fetch tax ID details:', await taxIdResponse.text());
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
    const fileLinksResponse = await fetch(`https://api.stripe.com/v1/file_links?file=${fileId}&limit=1`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (fileLinksResponse.ok) {
      const fileLinksData = await fileLinksResponse.json() as any;
      
      if (fileLinksData.data && fileLinksData.data.length > 0) {
        // Use existing file link
        return fileLinksData.data[0].url;
      } else {
        // Create a new file link
        const createLinkResponse = await fetch('https://api.stripe.com/v1/file_links', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'file': fileId,
          }).toString(),
        });
        
        if (createLinkResponse.ok) {
          const createLinkData = await createLinkResponse.json() as any;
          return createLinkData.url || '';
        } else {
          console.error('Failed to create file link:', await createLinkResponse.text());
        }
      }
    } else {
      console.error('Failed to fetch file links:', await fileLinksResponse.text());
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
  try {
    // If we have a charge ID, try to get subscription from invoice first
    if (chargeId) {
      const chargeResponse = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, {
        headers: {
          'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (chargeResponse.ok) {
        const chargeData = await chargeResponse.json() as any;
        if (chargeData.invoice) {
          const invoiceResponse = await fetch(`https://api.stripe.com/v1/invoices/${chargeData.invoice}`, {
            headers: {
              'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (invoiceResponse.ok) {
            const invoiceData = await invoiceResponse.json() as any;
            if (invoiceData.subscription) {
              return await getSubscriptionDetailsFromId(c, invoiceData.subscription);
            }
          }
        }
      }
    }
    
    // Otherwise, get the active subscription directly
    const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (subscriptionResponse.ok) {
      const subscriptionData = await subscriptionResponse.json() as any;
      if (subscriptionData.data && subscriptionData.data.length > 0) {
        const subscription = subscriptionData.data[0];
        return await getSubscriptionDetailsFromId(c, subscription.id);
      }
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
  try {
    const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (subscriptionResponse.ok) {
      const subscriptionData = await subscriptionResponse.json() as any;
      const priceId = subscriptionData.items.data[0]?.price?.id;
      
      if (priceId) {
        const priceResponse = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
          headers: {
            'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (priceResponse.ok) {
          const priceData = await priceResponse.json() as any;
          const productId = priceData.product;
          
          const productResponse = await fetch(`https://api.stripe.com/v1/products/${productId}`, {
            headers: {
              'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (productResponse.ok) {
            const productData = await productResponse.json() as any;
            
            return {
              id: subscriptionId,
              planName: productData.name || 'Unknown Plan',
              interval: priceData.recurring?.interval || 'month',
              amount: (priceData.unit_amount / 100).toFixed(2),
              currency: priceData.currency || 'usd'
            };
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching subscription details:', error);
  }
  
  return null;
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
export async function getCustomerCharges(c: any, customerId: string): Promise<Array<{ id: string; amount?: number; created?: number }>> {
  const chargesResponse = await fetch(`https://api.stripe.com/v1/charges?customer=${customerId}&limit=100`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!chargesResponse.ok) {
    throw new Error('Failed to fetch charges data');
  }

  const chargesData = await chargesResponse.json() as { data: Array<{ id: string; amount?: number; created?: number }> };
  return chargesData.data || [];
}

/**
 * Fetches a specific charge from Stripe
 * @param c The context object containing environment variables
 * @param chargeId The ID of the charge to fetch
 * @returns Charge data
 */
export async function getChargeData(c: any, chargeId: string): Promise<ChargeData> {
  const chargeResponse = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!chargeResponse.ok) {
    throw new Error('Failed to fetch charge data');
  }

  return await chargeResponse.json() as ChargeData;
}

/**
 * Creates a billing portal session for a customer
 * @param c The context object containing environment variables
 * @param customerId The ID of the customer
 * @param returnUrl The URL to return to after the billing portal
 * @returns The URL of the billing portal session
 */
export async function createBillingPortalSession(c: any, customerId: string, returnUrl: string): Promise<string> {
  const portalResponse = await fetch(`https://api.stripe.com/v1/billing_portal/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'customer': customerId,
      'return_url': returnUrl,
    }).toString(),
  });

  if (!portalResponse.ok) {
    throw new Error('Failed to create billing portal session');
  }

  const portalData = await portalResponse.json() as { url: string };
  return portalData.url;
}

/**
 * Fetches Stripe webhook endpoints
 * @param c The context object containing environment variables
 * @returns Array of webhook endpoint objects
 */
export async function getWebhookEndpoints(c: any): Promise<Array<any>> {
  const webhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!webhookResponse.ok) {
    throw new Error('Failed to fetch Stripe webhooks');
  }

  const webhookData = await webhookResponse.json() as { data: Array<any> };
  return webhookData.data || [];
}

/**
 * Deletes a Stripe webhook endpoint
 * @param c The context object containing environment variables
 * @param webhookId The ID of the webhook to delete
 * @returns Promise indicating success or failure
 */
export async function deleteWebhookEndpoint(c: any, webhookId: string): Promise<void> {
  const deleteResponse = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${webhookId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!deleteResponse.ok) {
    throw new Error('Failed to delete Stripe webhook');
  }
}

/**
 * Creates a Stripe webhook endpoint
 * @param c The context object containing environment variables
 * @param url The URL for the webhook
 * @param events The events to enable for the webhook
 * @returns The created webhook object
 */
export async function createWebhookEndpoint(c: any, url: string, events: string[]): Promise<any> {
  const createWebhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'url': url,
      ...events.reduce((acc, event, index) => {
        acc[`enabled_events[${index}]`] = event;
        return acc;
      }, {} as Record<string, string>),
    }).toString(),
  });

  if (!createWebhookResponse.ok) {
    throw new Error('Failed to create Stripe webhook');
  }

  return await createWebhookResponse.json();
}

/**
 * Fetches Stripe account information
 * @param c The context object containing environment variables
 * @returns Account information
 */
export async function getAccountInfo(c: any): Promise<any> {
  const accountResponse = await fetch('https://api.stripe.com/v1/account', {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!accountResponse.ok) {
    throw new Error('Failed to fetch account information');
  }

  return await accountResponse.json();
}

/**
 * Fetches invoice data for a specific charge
 * @param c The context object containing environment variables
 * @param chargeId The ID of the charge to fetch invoice for
 * @returns Invoice data if available, null otherwise
 */
export async function getInvoiceFromCharge(c: any, chargeId: string): Promise<any | null> {
  const chargeResponse = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!chargeResponse.ok) {
    throw new Error('Failed to fetch charge data for invoice');
  }

  const chargeData = await chargeResponse.json() as any;
  if (chargeData.invoice) {
    const invoiceResponse = await fetch(`https://api.stripe.com/v1/invoices/${chargeData.invoice}`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (invoiceResponse.ok) {
      return await invoiceResponse.json();
    }
  }
  return null;
}
