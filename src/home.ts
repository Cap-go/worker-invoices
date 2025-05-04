import { renderHtml } from './utils';
import { getWebhookEndpoints, getAccountInfo } from './stripe';

export const home = async (c: any) => {
    try {
      console.log('c.env', c.env);
      // Check for missing environment variables
      const missingVars = [];
      if (!c.env.STRIPE_API_KEY) missingVars.push('STRIPE_API_KEY');
      if (!c.env.RESEND_API_KEY) missingVars.push('RESEND_API_KEY');
      if (!c.env.CF_WORKER_DOMAIN) missingVars.push('CF_WORKER_DOMAIN');
      if (!c.env.EMAIL_FROM) missingVars.push('EMAIL_FROM');
  
      // Check webhook status
      let webhookStatus = 'Unknown';
      console.log('checking webhook status');
  
      try {
        const webhookData = await getWebhookEndpoints(c);
        console.log('webhookData', webhookData);
        const webhookUrl = `https://${c.env.CF_WORKER_DOMAIN}/webhook/stripe`;
        const existingWebhook = webhookData.find((wh: any) => wh.url === webhookUrl && wh.enabled_events.includes('charge.succeeded'));
        webhookStatus = existingWebhook ? 'Configured' : 'Not Configured';
        console.log('webhookStatus', webhookStatus);
      } catch (error) {
        console.log('error fetching webhook status', error);
        webhookStatus = 'Error fetching webhook status';
      }
      console.log('webhookcheck done');
  
      // Fetch company info for legal requirements
      let companyInfo = {
        name: 'Not Set',
        description: 'Not Set',
        address: 'Not Set',
        email: 'Not Set',
        vat: 'Not Set',
        vatId: '',
        brandColor: '#000000',
        secondaryColor: '#ffffff',
        logo: ''
      };
      try {
        const accountData = await getAccountInfo(c);
        console.log('accountData', accountData);
        companyInfo = {
          name: accountData.business_profile?.name || 'Not Set',
          description: accountData.business_profile?.support_phone || 'Not Set',
          address: accountData.settings?.branding?.address || 'Not Set',
          email: accountData.email || 'Not Set',
          vat: accountData.business_profile?.tax_id || 'Not Set',
          vatId: accountData.business_profile?.tax_id ? `VAT: ${accountData.business_profile.tax_id}` : '',
          brandColor: accountData.settings?.branding?.primary_color || '#000000',
          secondaryColor: accountData.settings?.branding?.secondary_color || '#ffffff',
          logo: accountData.settings?.branding?.logo || ''
        };
      } catch (error) {
        console.error('Error fetching company info:', error);
      }
  
      // Determine if configuration is complete
      const isConfigured = missingVars.length === 0 && webhookStatus === 'Configured';
  
      const content = `
        <header class="header">
          <div class="company-info">
            ${companyInfo.logo ? 
              `<img src="${companyInfo.logo}" alt="${companyInfo.name} Logo" class="logo">` : 
              `<svg viewBox="0 0 60 25" xmlns="http://www.w3.org/2000/svg" width="48" height="48" class="logo"><title>Stripe logo</title><path fill="${companyInfo.brandColor}" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 0 0-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z" fill-rule="evenodd"></path></svg>`
            }
            <div class="company-details">
              <span class="company-name">${companyInfo.name !== 'Not Set' ? companyInfo.name : 'Free Stripe Invoice Sender API'}</span>
              <span class="company-meta">${companyInfo.description}</span>
            </div>
          </div>
          ${companyInfo.email !== 'Not Set' && companyInfo.address !== 'Not Set' ? 
            `<div class="company-details">
              <span class="company-meta">${companyInfo.address}</span>
              ${companyInfo.vatId ? `<span class="company-meta">VAT: ${companyInfo.vatId}</span>` : ''}
            </div>` : ''
          }
        </header>

        <h1 class="page-title">Free Stripe Invoice Sender API</h1>
        
        <div class="card">
          <div class="card-header">
            <h2 class="text-xl font-semibold">Configuration Status</h2>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p class="text-gray-700 font-medium">Environment Variables:</p>
                ${missingVars.length > 0 ? 
                  `<span class="status-badge status-missing">Missing: ${missingVars.join(', ')}</span>` : 
                  `<span class="status-badge status-paid">All variables configured</span>`
                }
              </div>
              <div>
                <p class="text-gray-700 font-medium">Webhook Status:</p>
                <span class="status-badge ${webhookStatus === 'Configured' ? 'status-paid' : 'status-missing'}">${webhookStatus}</span>
              </div>
            </div>
            <div>
              <p class="text-gray-700 font-medium mb-2">Legally Required Company Information:</p>
              <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <li class="flex items-center">
                  <span>Company Name:</span>
                  <span class="ml-2 status-badge ${companyInfo.name === 'Not Set' ? 'status-missing' : 'status-set'}">
                    ${companyInfo.name === 'Not Set' ? 'Not Set' : 'Set'}
                  </span>
                  ${companyInfo.name === 'Not Set' ? 
                    '<a href="https://dashboard.stripe.com/settings/account" target="_blank" class="ml-2 action-link">Set in Stripe</a>' : ''}
                </li>
                <li class="flex items-center">
                  <span>Company Address:</span>
                  <span class="ml-2 status-badge ${companyInfo.address === 'Not Set' ? 'status-missing' : 'status-set'}">
                    ${companyInfo.address === 'Not Set' ? 'Not Set' : 'Set'}
                  </span>
                  ${companyInfo.address === 'Not Set' ? 
                    '<a href="https://dashboard.stripe.com/settings/account" target="_blank" class="ml-2 action-link">Set in Stripe</a>' : ''}
                </li>
                <li class="flex items-center">
                  <span>Company Email:</span>
                  <span class="ml-2 status-badge ${companyInfo.email === 'Not Set' ? 'status-missing' : 'status-set'}">
                    ${companyInfo.email === 'Not Set' ? 'Not Set' : 'Set'}
                  </span>
                  ${companyInfo.email === 'Not Set' ? 
                    '<a href="https://dashboard.stripe.com/settings/emails" target="_blank" class="ml-2 action-link">Set in Stripe</a>' : ''}
                </li>
                <li class="flex items-center">
                  <span>VAT ID:</span>
                  <span class="ml-2 status-badge ${companyInfo.vat === 'Not Set' ? 'status-missing' : 'status-set'}">
                    ${companyInfo.vat === 'Not Set' ? 'Not Set' : 'Set'}
                  </span>
                  ${companyInfo.vat === 'Not Set' ? 
                    '<a href="https://dashboard.stripe.com/settings/tax" target="_blank" class="ml-2 action-link">Set in Stripe</a>' : ''}
                </li>
                <li class="flex items-center">
                  <span>Brand Color:</span>
                  <span class="ml-2 status-badge ${companyInfo.brandColor === 'Not Set' ? 'status-missing' : 'status-set'}">
                    ${companyInfo.brandColor === 'Not Set' ? 'Not Set' : 'Set'}
                  </span>
                  ${companyInfo.brandColor === 'Not Set' ? 
                    '<a href="https://dashboard.stripe.com/settings/branding" target="_blank" class="ml-2 action-link">Set in Stripe</a>' : ''}
                </li>
                <li class="flex items-center">
                  <span>Logo:</span>
                  <span class="ml-2 status-badge ${companyInfo.logo ? 'status-set' : 'status-missing'}">
                    ${companyInfo.logo ? 'Set' : 'Not Set'}
                  </span>
                  ${!companyInfo.logo ? 
                    '<a href="https://dashboard.stripe.com/settings/branding" target="_blank" class="ml-2 action-link">Set in Stripe</a>' : ''}
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h2 class="text-xl font-semibold">Overview</h2>
          </div>
          <div class="card-body">
            <p class="text-gray-700 mb-4">This Cloudflare Worker automates sending invoices to customers after a successful Stripe charge. It listens for <code>charge.succeeded</code> events via a webhook and sends PDF invoices via email.</p>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h2 class="text-xl font-semibold">API Usage</h2>
          </div>
          <div class="card-body">
            <p class="text-gray-700 mb-2">To manually send an invoice, use the following endpoint:</p>
            <div class="flex items-center mb-4">
              <span class="font-medium text-gray-700 mr-2">POST Example:</span>
              <button onclick="copyApiExample('curl')" class="btn btn-primary mr-2">Copy as cURL</button>
              <button onclick="copyApiExample('fetch')" class="btn btn-primary">Copy as fetch</button>
            </div>
            <div class="code-block" id="api-post-example">
              <span class="code-keyword">POST</span> <span class="code-url">https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice</span>
              <span class="code-bracket">{</span>
                <span class="code-property">"customerId"</span>: <span class="code-string">"your-customer-id"</span>,
                <span class="code-property">"chargeId"</span>: <span class="code-string">"your-charge-id"</span>
              <span class="code-bracket">}</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h2 class="text-xl font-semibold">Customer Billing Portal</h2>
          </div>
          <div class="card-body">
            <p class="text-gray-700 mb-4">Customers can access their billing history and download invoices via a unique URL. Use their Stripe Customer ID and append it to the URL:</p>
            <div class="code-block">
              <span class="code-url">https://${c.env.CF_WORKER_DOMAIN}/billing/&lt;customer-id&gt;</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h2 class="text-xl font-semibold">Webhook Configuration</h2>
          </div>
          <div class="card-body">
            <p class="text-gray-700 mb-4">This worker automatically sets up a Stripe webhook to listen for <code>charge.succeeded</code> events. A scheduled task runs every minute to ensure the webhook is configured using the <code>CF_WORKER_DOMAIN</code>.</p>
            <div class="mb-2">
              <span class="font-medium text-gray-700">Webhook URL:</span>
              <div class="code-block mt-2 mb-2">
                <span class="code-url">https://${c.env.CF_WORKER_DOMAIN}/webhook/stripe</span>
              </div>
            </div>
            <p class="text-gray-700 mt-2">Note: Webhook signature verification is <span class="font-semibold text-red-600">not implemented</span>. The only action possible is sending an invoice if you have the <code>customerId</code> and <code>chargeId</code>, which is secure for this use case.</p>
          </div>
        </div>
      `;
      
      // Pass the brand colors to the renderHtml function
      const html = renderHtml('Invoice Sender API', content, c.env.CF_WORKER_DOMAIN, companyInfo.brandColor, companyInfo.secondaryColor);
      return c.html(html, isConfigured ? 200 : 503 as any);
    } catch (error) {
      console.error('Error rendering homepage:', error);
      const content = `
        <div class="card">
          <div class="card-body">
            <div class="status-badge status-missing">
              <strong class="font-bold">Error:</strong>
              <span class="block sm:inline">Internal server error.</span>
            </div>
          </div>
        </div>
      `;
      return c.html(renderHtml('Error - Internal Server Error', content, c.env.CF_WORKER_DOMAIN), 500 as any);
    }
}
