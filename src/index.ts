import { Hono } from 'hono';
import nodemailer from 'nodemailer';
import jsPDF from 'jspdf';

const app = new Hono<{ Bindings: { 
  STRIPE_API_KEY: string; 
  SMTP_HOST: string; 
  SMTP_PORT: string; 
  SMTP_USERNAME: string; 
  SMTP_PASSWORD: string; 
  SMTP_FROM: string; 
  INVOICE_DB: KVNamespace; 
  CF_WORKER_DOMAIN: string; 
  DEV_MODE: string 
} }>();

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

// Helper function for rendering HTML with a consistent base template
const renderHtml = (title: string, content: string, status: 'success' | 'error' = 'success') => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 font-sans">
      <div class="container mx-auto p-4 max-w-4xl">
        ${content}
      </div>
    </body>
  </html>
`;

// Homepage to list past charges for a customer
app.get('/billing/:encodedCustomerId', async (c) => {
  try {
    const encodedCustomerId = c.req.param('encodedCustomerId');
    const customerId = atob(encodedCustomerId);
    
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
      return c.html(renderHtml('Error - Customer Data', content, 'error'), 500 as any);
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

    return c.html(renderHtml(`Billing History for ${name}`, content));
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
    return c.html(renderHtml('Error - Internal Server Error', content, 'error'), 500 as any);
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
  const brandColor = accountData.settings.branding.primary_color || '#000000';
  const companyName = accountData.business_profile?.name || '';
  const companyAddress = accountData.settings.dashboard?.display_name ? `${accountData.settings.dashboard.display_name}, ${accountData.country || ''}` : '';
  const companyEmail = accountData.business_profile?.support_email || '';
  const companyVat = accountData.business_profile?.tax_id || '';

  // Generate or increment invoice number for this customer using Cloudflare KV
  const kvKey = `invoice:${customerId}`;
  let invoiceNumber = parseInt(await c.env.INVOICE_DB.get(kvKey) || '0', 10);
  invoiceNumber += 1;
  await c.env.INVOICE_DB.put(kvKey, invoiceNumber.toString());

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
      secure: c.env.SMTP_PORT === '465',
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
  const billingUrl = `https://${c.env.CF_WORKER_DOMAIN}/billing/${btoa(customerId)}`;
  const emailContent = `
    <html>
      <body style="color: ${brandColor};">
        <img src="${logoUrl}" alt="Brand Logo" style="max-width: 200px;" />
        <h1>Invoice #${invoiceNumber} for ${name}</h1>
        <p>Email: ${email}</p>
        <p>Charge: $${chargeAmount} on ${chargeDate}</p>
        <p>Charge ID: ${chargeId}</p>
        <p>Download your invoice PDF from the attached link.</p>
        <p>View all your billing history <a href="${billingUrl}" style="color: ${brandColor}; text-decoration: underline;">here</a>.</p>
        <p>Need to update your billing information? <a href="https://billing.stripe.com/p/login/customer/${customerId}" style="color: ${brandColor}; text-decoration: underline;">Manage your billing details here</a>.</p>
      </body>
    </html>
  `;

  // Generate PDF using jsPDF
  const doc = new jsPDF({
    orientation: 'p',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.width;

  const now = new Date();
  const dateToday = (now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear();

  const setFontType = (val: string) => {
    doc.setFontType(val);
  };

  const docText = (x: number, y: number, text: string) => {
    if (x > 0) return doc.text(x, y, text);
    return doc.text(pageWidth + x, y, text, null, null, 'right');
  };

  doc.setFont('helvetica');
  setFontType('bold');
  doc.setFontSize(14);
  if (companyName) {
    docText(20, 24, companyName);
  }
  docText(-20, 24, `Invoice #${invoiceNumber}`);

  setFontType('normal');
  doc.setFontSize(10);
  doc.setLineHeightFactor(1.3);
  if (companyAddress) {
    docText(20, 30, companyAddress.split(', ')[0] || '');
    if (companyAddress.split(', ')[1]) {
      docText(20, 36, companyAddress.split(', ')[1]);
    }
  }
  if (companyVat) {
    docText(20, companyAddress && companyAddress.split(', ')[1] ? 42 : companyAddress ? 36 : 30, `VAT ID: ${companyVat}`);
  }
  if (companyEmail) {
    docText(20, companyVat ? (companyAddress && companyAddress.split(', ')[1] ? 48 : companyAddress ? 42 : 36) : (companyAddress && companyAddress.split(', ')[1] ? 42 : companyAddress ? 36 : 30), `Email: ${companyEmail}`);
  }
  docText(-20, 30, dateToday);

  if (name) {
    docText(20, 60, name);
  }
  if (customerData.address?.line1) {
    docText(20, 66, customerData.address.line1);
  }
  if (customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) {
    docText(20, customerData.address?.line1 ? 72 : 66, `${customerData.address?.city || ''}${customerData.address?.city && customerData.address?.state ? ', ' : ''}${customerData.address?.state || ''} ${customerData.address?.postal_code || ''}`);
  }
  if (customerData.address?.country) {
    docText(20, (customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) ? (customerData.address?.line1 ? 78 : 72) : (customerData.address?.line1 ? 72 : 66), customerData.address.country);
  }
  docText(20, customerData.address?.country ? ((customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) ? (customerData.address?.line1 ? 84 : 78) : (customerData.address?.line1 ? 78 : 72)) : ((customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) ? (customerData.address?.line1 ? 78 : 72) : (customerData.address?.line1 ? 72 : 66)), `Email: ${email}`);

  setFontType('bold');
  docText(20, 98, 'Description');
  doc.text(pageWidth - 20, 98, 'Amount', null, null, 'right');

  doc.setLineWidth(0.333);
  doc.line(20, 102, pageWidth - 20, 102);

  setFontType('normal');
  docText(20, 108, `Payment for Charge ID ${chargeId}`);
  docText(20, 114, `Date: ${chargeDate}`);
  docText(-20, 108, `$${chargeAmount}`);

  setFontType('bold');
  docText(-20, 128, `Total    $${chargeAmount}`);

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  console.log('PDF generated successfully with jsPDF');

  // Send email using nodemailer
  const transporter = nodemailer.createTransport({
    host: c.env.SMTP_HOST,
    port: parseInt(c.env.SMTP_PORT, 10),
    secure: c.env.SMTP_PORT === '465', // Use SSL if port is 465
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
