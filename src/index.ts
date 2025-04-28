import { Hono } from 'hono';
import { logger } from 'hono/logger'
import nodemailer from 'nodemailer';
import jsPDF from 'jspdf';

const app = new Hono<{ 
  Bindings: { 
    STRIPE_API_KEY: string; 
    SMTP_HOST: string; 
    SMTP_PORT: string; 
    SMTP_USERNAME: string; 
    SMTP_PASSWORD: string; 
    SMTP_FROM: string; 
    SMTP_SECURE: string;
    CF_WORKER_DOMAIN: string; 
    DEV_MODE: string 
  }
}>();

app.use('*', logger());

// API endpoint for sending invoices manually
app.post('/api/send-invoice', async (c) => {
  try {
    const { customerId, chargeId } = await c.req.json();
    
    if (!customerId) {
      return c.json({ error: 'Customer ID is required' }, 400 as any);
    }
    if (!chargeId) {
      return c.json({ error: 'Charge ID is required' }, 400 as any);
    }

    return await sendInvoice(c, customerId, `Invoice for charge ${chargeId}`, chargeId);
  } catch (error) {
    console.error('Error processing manual invoice:', error);
    return c.json({ error: 'Internal server error' }, 500 as any);
  }
});

function getCopyApiExampleScript(cfWorkerDomain: string) {
  const html = `<script>
    window.copyApiExample = function(type) {
      var url = 'https://__CF_WORKER_DOMAIN__/api/send-invoice';
      var body = JSON.stringify({ customerId: 'your-customer-id', chargeId: 'your-charge-id' }, null, 2);
      var text = '';
      if (type === 'curl') {
        text = \`${`curl -X POST '\${url}' -H 'Content-Type: application/json' -d '\${body.replace(/'/g, "'\\''")}'`}\`;
      } else {
        text = \`${`fetch('\${url}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ customerId: 'your-customer-id', chargeId: 'your-charge-id' })\n})`}\`;
      }
      navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    };
  </script>`;
  return html.replace(/__CF_WORKER_DOMAIN__/g, cfWorkerDomain)
}

const renderHtml = (title: string, content: string, cfWorkerDomain: string) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="icon" type="image/png" href="https://stripe.com/favicon.ico" />
      </head>
      <body class="bg-gray-100 font-sans">
        <div class="container mx-auto p-4 max-w-4xl">
          ${content}
        </div>
        ${getCopyApiExampleScript(cfWorkerDomain)}
      </body>
    </html>
  `;
  return html;
};

// Homepage to explain API usage, portal, webhook configuration, and status
app.get('/', async (c) => {
  try {
    console.log('c.env', c.env);
    // Check for missing environment variables
    const missingVars = [];
    if (!c.env.STRIPE_API_KEY) missingVars.push('STRIPE_API_KEY');
    if (!c.env.SMTP_HOST) missingVars.push('SMTP_HOST');
    if (!c.env.SMTP_SECURE) missingVars.push('SMTP_SECURE');
    if (!c.env.SMTP_PORT) missingVars.push('SMTP_PORT');
    if (!c.env.SMTP_USERNAME) missingVars.push('SMTP_USERNAME');
    if (!c.env.SMTP_PASSWORD) missingVars.push('SMTP_PASSWORD');
    if (!c.env.SMTP_FROM) missingVars.push('SMTP_FROM');
    if (!c.env.CF_WORKER_DOMAIN) missingVars.push('CF_WORKER_DOMAIN');

    // Check webhook status
    let webhookStatus = 'Unknown';
    console.log('checking webhook status');

    try {
      const webhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
        headers: {
          'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (webhookResponse.ok) {
        console.log('webhookResponse.ok');
        const webhookData = await webhookResponse.json() as any;
        console.log('webhookData', webhookData);
        const webhookUrl = `https://${c.env.CF_WORKER_DOMAIN}/webhook/stripe`;
        const existingWebhook = webhookData.data.find((wh: any) => wh.url === webhookUrl && wh.enabled_events.includes('charge.succeeded'));
        webhookStatus = existingWebhook ? 'Configured' : 'Not Configured';
        console.log('webhookStatus', webhookStatus);
      } else {
        console.log('webhookResponse.not ok');
        webhookStatus = 'Error fetching webhook status';
      }
    } catch (error) {
      console.log('error fetching webhook status', error);
      webhookStatus = 'Error fetching webhook status';
    }
    console.log('webhookcheck done');

    // Fetch company info for legal requirements
    let companyInfo = { name: 'Not Set', address: 'Not Set', email: 'Not Set', vat: 'Not Set', brandColor: 'Not Set', logo: 'Not Set', secondaryColor: 'Not Set' };
    try {
      console.log('fetching company info');
      const accountResponse = await fetch('https://api.stripe.com/v1/account', {
        headers: {
          'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (accountResponse.ok) {
        console.log('accountResponse.ok');
        const accountData = await accountResponse.json() as any;
        console.log('accountData', accountData);
        companyInfo.name = accountData.business_profile?.name ? 'Set' : 'Not Set';
        companyInfo.address = accountData.settings.dashboard?.display_name && accountData.country ? 'Set' : 'Not Set';
        companyInfo.email = accountData.business_profile?.support_email ? 'Set' : 'Not Set';
        companyInfo.vat = accountData.settings.invoices?.default_account_tax_ids?.length > 0 ? 'Set' : 'Not Set';
        companyInfo.brandColor = accountData.settings.branding?.primary_color ? 'Set' : 'Not Set';
        companyInfo.secondaryColor = accountData.settings.branding?.secondary_color ? 'Set' : 'Not Set';
        companyInfo.logo = accountData.settings.branding?.logo ? 'Set' : 'Not Set';
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }

    // Determine if configuration is complete
    const isConfigured = missingVars.length === 0 && webhookStatus === 'Configured';

    const content = `
      <div class="flex justify-center mb-6">
        <svg viewBox="0 0 60 25" xmlns="http://www.w3.org/2000/svg" width="180" height="75" class="UserLogo variant-- "><title>Stripe logo</title><path fill="var(--userLogoColor, #0A2540)" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 0 0-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z" fill-rule="evenodd"></path></svg>
      </div>
      <h1 class="text-3xl font-bold mb-6 text-center text-[#635BFF]"> Free Stripe Invoice Sender API</h1>
      <div class="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 class="text-2xl font-semibold mb-4">Configuration Status</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <p class="text-gray-700 font-medium">Environment Variables:</p>
            ${missingVars.length > 0 ? 
              `<p class="text-red-600">Missing: ${missingVars.join(', ')}</p>` : 
              `<p class="text-green-600">All variables configured</p>`
            }
          </div>
          <div>
            <p class="text-gray-700 font-medium">Webhook Status:</p>
            <p class="${webhookStatus === 'Configured' ? 'text-green-600' : webhookStatus === 'Not Configured' ? 'text-red-600' : 'text-yellow-600'}">${webhookStatus}</p>
          </div>
        </div>
        <div>
          <p class="text-gray-700 font-medium mb-2">Legally Required Company Information:</p>
          <ul class="list-disc list-inside text-gray-700">
            <li>Company Name: <span class="${companyInfo.name === 'Not Set' ? 'text-red-600' : 'text-green-600'}">${companyInfo.name === 'Not Set' ? 'Not Set' : 'Set'}${companyInfo.name === 'Not Set' ? ' <a href="https://dashboard.stripe.com/settings/account" target="_blank" class="text-blue-500 underline">Set in Stripe</a>' : ''}</span></li>
            <li>Company Address: <span class="${companyInfo.address === 'Not Set' ? 'text-red-600' : 'text-green-600'}">${companyInfo.address === 'Not Set' ? 'Not Set' : 'Set'}${companyInfo.address === 'Not Set' ? ' <a href="https://dashboard.stripe.com/settings/account" target="_blank" class="text-blue-500 underline">Set in Stripe</a>' : ''}</span></li>
            <li>Company Email: <span class="${companyInfo.email === 'Not Set' ? 'text-red-600' : 'text-green-600'}">${companyInfo.email === 'Not Set' ? 'Not Set' : 'Set'}${companyInfo.email === 'Not Set' ? ' <a href="https://dashboard.stripe.com/settings/emails" target="_blank" class="text-blue-500 underline">Set in Stripe</a>' : ''}</span></li>
            <li>VAT ID: <span class="${companyInfo.vat === 'Not Set' ? 'text-red-600' : 'text-green-600'}">${companyInfo.vat === 'Not Set' ? 'Not Set' : 'Set'}${companyInfo.vat === 'Not Set' ? ' <a href="https://dashboard.stripe.com/settings/tax" target="_blank" class="text-blue-500 underline">Set in Stripe</a>' : ''}</span></li>
            <li>Brand Color: <span class="${companyInfo.brandColor === 'Not Set' ? 'text-red-600' : 'text-green-600'}">${companyInfo.brandColor === 'Not Set' ? 'Not Set' : 'Set'}${companyInfo.brandColor === 'Not Set' ? ' <a href="https://dashboard.stripe.com/settings/branding" target="_blank" class="text-blue-500 underline">Set in Stripe</a>' : ''}</span></li>
            <li>Logo: <span class="${companyInfo.logo === 'Not Set' ? 'text-red-600' : 'text-green-600'}">${companyInfo.logo === 'Not Set' ? 'Not Set' : 'Set'}${companyInfo.logo === 'Not Set' ? ' <a href="https://dashboard.stripe.com/settings/branding" target="_blank" class="text-blue-500 underline">Set in Stripe</a>' : ''}</span></li>
          </ul>
        </div>
      </div>
      <div class="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 class="text-2xl font-semibold mb-4">Overview</h2>
        <p class="text-gray-700 mb-4">This Cloudflare Worker automates sending invoices to customers after a successful Stripe charge. It listens for <code>charge.succeeded</code> events via a webhook and sends PDF invoices via email.</p>
      </div>
      <div class="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 class="text-2xl font-semibold mb-4">API Usage</h2>
        <p class="text-gray-700 mb-2">To manually send an invoice, use the following endpoint:</p>
        <div class="flex items-center mb-2">
          <span class="font-medium text-gray-700 mr-2">POST Example:</span>
          <button onclick="copyApiExample('curl')" class="bg-blue-500 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 rounded mr-2">Copy as cURL</button>
          <button onclick="copyApiExample('fetch')" class="bg-gray-700 hover:bg-gray-900 text-white text-xs font-bold py-1 px-2 rounded">Copy as fetch</button>
        </div>
        <pre class="bg-gray-900 text-white p-4 rounded-md text-sm overflow-auto mb-4" id="api-post-example"><code><span class="text-pink-400">POST</span> <span class="text-blue-400">https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice</span>
<span class="text-yellow-300">{</span>
  <span class="text-green-400">"customerId"</span>: <span class="text-red-400">"your-customer-id"</span>,
  <span class="text-green-400">"chargeId"</span>: <span class="text-red-400">"your-charge-id"</span>
<span class="text-yellow-300">}</span></code></pre>
      </div>
      <div class="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 class="text-2xl font-semibold mb-4">Customer Billing Portal</h2>
        <p class="text-gray-700 mb-4">Customers can access their billing history and download invoices via a unique URL. Use their Stripe Customer ID and append it to the URL:</p>
        <pre class="bg-gray-900 text-white p-4 rounded-md text-sm overflow-auto mb-4"><code><span class="text-blue-400">https://${c.env.CF_WORKER_DOMAIN}/billing/&lt;customer-id&gt;</span></code></pre>
      </div>
      <div class="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 class="text-2xl font-semibold mb-4">Webhook Configuration</h2>
        <p class="text-gray-700 mb-4">This worker automatically sets up a Stripe webhook to listen for <code>charge.succeeded</code> events. A scheduled task runs every minute to ensure the webhook is configured using the <code>CF_WORKER_DOMAIN</code>.</p>
        <div class="mb-2">
          <span class="font-medium text-gray-700">Webhook URL:</span>
          <pre class="bg-gray-900 text-white p-4 rounded-md text-sm overflow-auto mt-2 mb-2"><code><span class="text-blue-400">https://${c.env.CF_WORKER_DOMAIN}/webhook/stripe</span></code></pre>
        </div>
        <p class="text-gray-700 mt-2">Note: Webhook signature verification is <span class="font-semibold text-red-600">not implemented</span>. The only action possible is sending an invoice if you have the <code>customerId</code> and <code>chargeId</code>, which is secure for this use case.</p>
      </div>
    `;
    const html = renderHtml('Invoice Sender API', content, c.env.CF_WORKER_DOMAIN);
    return c.html(html, isConfigured ? 200 : 503 as any);
  } catch (error) {
    console.error('Error rendering homepage:', error);
    const content = `
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong class="font-bold">Error:</strong>
        <span class="block sm:inline">Internal server error.</span>
      </div>
    `;
    return c.html(renderHtml('Error - Internal Server Error', content, c.env.CF_WORKER_DOMAIN), 500 as any);
  }
});

// Homepage to list past charges for a customer
app.get('/billing/:customerId', async (c) => {
  try {
    const customerId = c.req.param('customerId');
    
    // Fetch customer data from Stripe
    const customerResponse = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      const content = `
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong class="font-bold">Error:</strong>
          <span class="block sm:inline">Failed to fetch customer data.</span>
        </div>
        <div class="mt-6 text-center">
          <a href="javascript:history.back()" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Go Back</a>
        </div>
      `;
      return c.html(renderHtml('Error - Customer Data', content, c.env.CF_WORKER_DOMAIN), 500 as any);
    }

    const customerData = await customerResponse.json() as any;
    const name = customerData.name || 'Customer';

    // Fetch charges for the customer
    const chargesResponse = await fetch(`https://api.stripe.com/v1/charges?customer=${customerId}&limit=100`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const chargesData = await chargesResponse.json() as any;
    const charges = chargesData.data || [];

    // Generate HTML content for the billing page
    const content = `
      <h1 class="text-3xl font-bold mb-6 text-center">Billing History for ${name}</h1>
      <div class="mb-4">
        <a href="https://billing.stripe.com/p/login/customer/${customerId}" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Edit Billing Information</a>
      </div>
      <div class="bg-white shadow-md rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${charges.map((charge: any) => `
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${charge.created ? new Date(charge.created * 1000).toLocaleDateString() : 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${charge.amount ? charge.amount / 100 : 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <a href="/api/send-invoice?customerId=${customerId}&chargeId=${charge.id}" class="text-blue-600 hover:text-blue-800">Send me this Invoice</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    return c.html(renderHtml(`Billing History for ${name}`, content, c.env.CF_WORKER_DOMAIN));
  } catch (error) {
    console.error('Error rendering billing page:', error);
    const content = `
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong class="font-bold">Error:</strong>
        <span class="block sm:inline">Internal server error.</span>
      </div>
      <div class="mt-6 text-center">
        <a href="javascript:history.back()" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Go Back</a>
      </div>
    `;
    return c.html(renderHtml('Error - Internal Server Error', content, c.env.CF_WORKER_DOMAIN), 500 as any);
  }
});

// Webhook endpoint for Stripe to auto-send invoices after a successful charge
app.post('/webhook/stripe', async (c) => {
  try {
    const body = await c.req.json();
    
    // Verify webhook signature (in a real implementation, use Stripe's webhook signature verification)
    console.log('Webhook received:', body.type);
    
    if (body.type === 'charge.succeeded') {
      const charge = body.data.object;
      const customerId = charge.customer;
      const chargeId = charge.id;
      
      if (customerId && chargeId) {
        return await sendInvoice(c, customerId, `Auto-generated invoice for charge ${chargeId}`, chargeId);
      } else {
        console.log('No customer ID or charge ID found in charge:', charge.id);
        return c.json({ message: 'No customer ID or charge ID found' }, 200 as any);
      }
    }
    
    return c.json({ message: 'Webhook processed' }, 200 as any);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({ error: 'Internal server error' }, 500 as any);
  }
});

// Scheduled task to check and add Stripe webhook if not present
export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    try {
      console.log('Scheduled task running to check Stripe webhook setup');
      
      // Fetch existing webhooks from Stripe
      const webhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
        headers: {
          'Authorization': `Bearer ${env.STRIPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!webhookResponse.ok) {
        console.error('Failed to fetch Stripe webhooks:', webhookResponse.status);
        return;
      }

      const webhookData = await webhookResponse.json() as any;
      const webhookUrl = `https://${env.CF_WORKER_DOMAIN}/webhook/stripe`;
      const existingWebhook = webhookData.data.find((wh: any) => wh.url === webhookUrl && wh.enabled_events.includes('charge.succeeded'));

      if (!existingWebhook) {
        console.log('Webhook not found, creating a new one');
        // Create a new webhook if not found
        const createWebhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.STRIPE_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'url': webhookUrl,
            'enabled_events[]': 'charge.succeeded',
          }).toString(),
        });

        if (!createWebhookResponse.ok) {
          console.error('Failed to create Stripe webhook:', createWebhookResponse.status);
          return;
        }

        const newWebhook = await createWebhookResponse.json() as any;
        console.log('Webhook created successfully:', newWebhook.id);
      } else {
        console.log('Webhook already exists:', existingWebhook.id);
      }
    } catch (error) {
      console.error('Error in scheduled webhook check:', error);
    }
  },
  fetch: app.fetch,
};

// Helper function to send invoice
async function sendInvoice(c: any, customerId: string, additionalInfo: string, chargeId: string) {
  // Fetch customer data from Stripe
  const stripeResponse = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!stripeResponse.ok) {
    return c.json({ error: 'Failed to fetch customer data from Stripe' }, stripeResponse.status as any);
  }

  const customerData = await stripeResponse.json() as any;
  const email = customerData.email;
  const name = customerData.name || 'Customer';

  // Fetch specific charge for the customer
  const chargesResponse = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const chargeData = await chargesResponse.json() as any;
  const chargeAmount = chargeData.amount ? chargeData.amount / 100 : 'N/A';
  const chargeDate = chargeData.created ? new Date(chargeData.created * 1000).toLocaleDateString() : 'N/A';

  // Fetch Stripe account data for branding (logo and color) and company info
  const accountResponse = await fetch('https://api.stripe.com/v1/account', {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const accountData = await accountResponse.json() as any;
  const logoUrl = accountData.settings.branding.logo || '';
  const brandColor = accountData.settings.branding.primary_color || '#5562eb';
  const secondaryColor = accountData.settings.branding.secondary_color || '#f6f9fc';
  const companyName = accountData.business_profile?.name || '';
  const companyAddress = accountData.settings.dashboard?.display_name ? `${accountData.settings.dashboard.display_name}, ${accountData.country || ''}` : '';
  const companyEmail = accountData.business_profile?.support_email || '';
  const companyVat = accountData.settings.invoices?.default_account_tax_ids?.length > 0 ? accountData.settings.invoices.default_account_tax_ids[0] : '';

  // Generate or increment invoice number for this customer using date and customerId
  const currentDate = new Date();
  const datePart = currentDate.getFullYear().toString().slice(-2) + (currentDate.getMonth() + 1).toString().padStart(2, '0') + currentDate.getDate().toString().padStart(2, '0');
  // Create a simple hash of customerId to a number between 0 and 100000
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) {
    hash = (hash * 31 + customerId.charCodeAt(i)) % 100000;
  }
  const invoiceNumber = `${datePart}${hash.toString().padStart(5, '0')}`;

  // Check for mandatory legal fields for invoice
  const isDevMode = c.env.DEV_MODE === 'true';
  const mandatoryFieldsMissing = !companyName || !companyAddress || !companyEmail || !companyVat;
  const recipientEmail = isDevMode ? email : companyEmail;

  if (mandatoryFieldsMissing && !companyEmail) {
    console.log('Mandatory legal fields for invoice are missing and no company email available to notify.');
    return c.json({ error: 'Unable to generate invoice due to missing mandatory legal information' }, 500 as any);
  }

  if (mandatoryFieldsMissing) {
    console.log(`Mandatory legal fields missing, sending notification to company email: ${companyEmail}`);
    const missingFields = [];
    if (!companyName) missingFields.push('Company Name');
    if (!companyAddress) missingFields.push('Company Address');
    if (!companyEmail) missingFields.push('Company Email');
    if (!companyVat) missingFields.push('VAT ID');
    const webhookUrlGet = `https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice?customerId=${customerId}&chargeId=${chargeId}`;
    const webhookUrlPost = `https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice`;
    const notificationContent = `
      <html>
        <body style="color: ${brandColor};">
          <h1>Invoice Generation Issue for #${invoiceNumber}</h1>
          <p>Mandatory legal information is missing for generating a valid invoice.</p>
          <p>The following fields are missing: ${missingFields.join(', ')}.</p>
          <p>Please update your Stripe account with the required business information.</p>
          <p>Once updated, you can resend the invoice by making a GET request to the following URL:</p>
          <pre>${webhookUrlGet}</pre>
          <p>Alternatively, you can use a POST request to the following URL with the JSON body:</p>
          <pre>URL: ${webhookUrlPost}</pre>
          <pre>
{
  "customerId": "${customerId}",
  "chargeId": "${chargeId}"
}
          </pre>
        </body>
      </html>
    `;
    const transporter = nodemailer.createTransport({
      host: c.env.SMTP_HOST,
      port: parseInt(c.env.SMTP_PORT, 10),
      secure: c.env.SMTP_SECURE === 'true',
      auth: {
        user: c.env.SMTP_USERNAME,
        pass: c.env.SMTP_PASSWORD,
      },
    });
    await transporter.sendMail({
      from: c.env.SMTP_FROM,
      to: companyEmail,
      subject: `Invoice Generation Issue #${invoiceNumber}`,
      html: notificationContent,
    });
    console.log(`Notification email sent to ${companyEmail} about missing legal fields for invoice #${invoiceNumber}`);
    return c.json({ error: 'Invoice generation halted due to missing mandatory legal information, notification sent to company' }, 500 as any);
  }

  // Construct email content with branding
  const billingUrl = `https://${c.env.CF_WORKER_DOMAIN}/billing/${customerId}`;
  const emailContent = `
    <html>
      <body style="color: ${brandColor}; background-color: ${secondaryColor}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <img src="${logoUrl}" alt="Brand Logo" style="max-width: 200px; margin-bottom: 20px;" />
          <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Invoice #${invoiceNumber} for ${name}</h1>
          <p style="margin-bottom: 10px;">Email: ${email}</p>
          <p style="margin-bottom: 10px;">Charge: $${chargeAmount} on ${chargeDate}</p>
          <p style="margin-bottom: 10px;">Charge ID: ${chargeId}</p>
          <p style="margin-bottom: 20px;">Download your invoice PDF from the attached link.</p>
          <p style="margin-bottom: 10px;">View all your billing history <a href="${billingUrl}" style="color: ${brandColor}; text-decoration: underline;">here</a>.</p>
          <p>Need to update your billing information? <a href="https://billing.stripe.com/p/login/customer/${customerId}" style="color: ${brandColor}; text-decoration: underline;">Manage your billing details here</a>.</p>
        </div>
      </body>
    </html>
  `;

  // Generate PDF using jsPDF with Stripe-like styling
  const doc = new jsPDF({
    orientation: 'p',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.width;

  const invoiceDate = new Date();
  const dateToday = (invoiceDate.getMonth() + 1) + '/' + invoiceDate.getDate() + '/' + invoiceDate.getFullYear();

  const setFontType = (val: string) => {
    doc.setFont('helvetica', val);
  };

  const docText = (x: number, y: number, text: string) => {
    if (x > 0) return doc.text(text, x, y);
    return doc.text(text, pageWidth + x, y, { align: 'right' });
  };

  // Set background color for header
  doc.setFillColor(secondaryColor);
  doc.rect(0, 0, pageWidth, 40, 'F');

  // Set brand color for text
  doc.setTextColor(brandColor);

  doc.setFont('helvetica');
  setFontType('bold');
  doc.setFontSize(18);
  if (companyName) {
    docText(20, 20, companyName);
  }
  docText(-20, 20, `Invoice #${invoiceNumber}`);

  setFontType('normal');
  doc.setFontSize(10);
  doc.setLineHeightFactor(1.3);
  if (companyAddress) {
    docText(20, 26, companyAddress.split(', ')[0] || '');
    if (companyAddress.split(', ')[1]) {
      docText(20, 32, companyAddress.split(', ')[1]);
    }
  }
  if (companyVat) {
    docText(20, companyAddress && companyAddress.split(', ')[1] ? 38 : companyAddress ? 32 : 26, `VAT ID: ${companyVat}`);
  }
  if (companyEmail) {
    docText(20, companyVat ? (companyAddress && companyAddress.split(', ')[1] ? 44 : companyAddress ? 38 : 32) : (companyAddress && companyAddress.split(', ')[1] ? 38 : companyAddress ? 32 : 26), `Email: ${companyEmail}`);
  }
  docText(-20, 26, `Date: ${dateToday}`);

  // Reset text color to black for body content
  doc.setTextColor(0, 0, 0);

  if (name) {
    docText(20, 50, name);
  }
  if (customerData.address?.line1) {
    docText(20, 56, customerData.address.line1);
  }
  if (customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) {
    docText(20, customerData.address?.line1 ? 62 : 56, `${customerData.address?.city || ''}${customerData.address?.city && customerData.address?.state ? ', ' : ''}${customerData.address?.state || ''} ${customerData.address?.postal_code || ''}`);
  }
  if (customerData.address?.country) {
    docText(20, (customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) ? (customerData.address?.line1 ? 68 : 62) : (customerData.address?.line1 ? 62 : 56), customerData.address.country);
  }
  docText(20, customerData.address?.country ? ((customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) ? (customerData.address?.line1 ? 74 : 68) : (customerData.address?.line1 ? 68 : 62)) : ((customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) ? (customerData.address?.line1 ? 68 : 62) : (customerData.address?.line1 ? 62 : 56)), `Email: ${email}`);

  // Table header with brand color background
  doc.setFillColor(brandColor);
  doc.rect(20, 85, pageWidth - 40, 10, 'F');
  doc.setTextColor(255, 255, 255); // White text for header
  setFontType('bold');
  docText(25, 91, 'Description');
  docText(-25, 91, 'Amount');

  // Reset text color for table content
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.line(20, 95, pageWidth - 20, 95);

  setFontType('normal');
  docText(25, 101, `Payment for Charge ID ${chargeId}`);
  docText(25, 107, `Date: ${chargeDate}`);
  docText(-25, 101, `$${chargeAmount}`);

  // Total row with light background
  doc.setFillColor(secondaryColor);
  doc.rect(20, 115, pageWidth - 40, 10, 'F');
  setFontType('bold');
  docText(-25, 121, `Total: $${chargeAmount}`);

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  console.log('PDF generated successfully with jsPDF');

  // Send email using nodemailer
  const transporter = nodemailer.createTransport({
    host: c.env.SMTP_HOST,
    port: parseInt(c.env.SMTP_PORT, 10),
    secure: c.env.SMTP_SECURE === 'true', // Use SSL if port is 465
    auth: {
      user: c.env.SMTP_USERNAME,
      pass: c.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: c.env.SMTP_FROM,
    to: recipientEmail,
    subject: `Invoice #${invoiceNumber}`,
    html: emailContent,
    attachments: [
      {
        filename: `invoice_${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  console.log(`Email sent to ${recipientEmail} with invoice #${invoiceNumber}`);

  return c.json({ message: 'Invoice sent successfully', invoiceNumber });
}
