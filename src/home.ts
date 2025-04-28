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

export const renderHtml = (title: string, content: string, cfWorkerDomain: string) => {
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

export const home = async (c: any) => {
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
        console.log('accountResponse', accountResponse.status);

        if (accountResponse.ok) {
          console.log('accountResponse.ok');
          const accountData = await accountResponse.json() as any;
          console.log('accountData', accountData);
          companyInfo.name = accountData.business_profile?.name || 'Not Set';
          companyInfo.address = (accountData.settings?.dashboard?.display_name && accountData.country) || 'Not Set';
          companyInfo.email = accountData.business_profile?.support_email || 'Not Set';
          companyInfo.vat = (accountData.settings?.invoices?.default_account_tax_ids?.length > 0) ? 'Set' : 'Not Set';
          companyInfo.brandColor = accountData.settings?.branding?.primary_color || 'Not Set';
          companyInfo.secondaryColor = accountData.settings?.branding?.secondary_color || 'Not Set';
          companyInfo.logo = accountData.settings?.branding?.logo || 'Not Set';
        } else {
          console.error('Account check failed with status:', accountResponse.status);
          console.error('Account check response:', await accountResponse.text());
          // Set default values or fallback if account data is not accessible
          console.log('Using fallback values for company info due to permission restrictions');
        }
      } catch (error) {
        console.error('Error fetching company info:', error);
        // Set default values or fallback if account data is not accessible
        console.log('Using fallback values for company info due to error');
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
}
