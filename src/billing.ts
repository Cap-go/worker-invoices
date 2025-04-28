import { renderHtml } from "./home";
import nodemailer from 'nodemailer';

export const billing = async (c: any) => {
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
        <a href="/api/request-billing-link?customerId=${customerId}" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Send me a Link to Edit Billing Info</a>
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
}

export const requestBillingLink = async (c: any) => {
  try {
    const customerId = c.req.query('customerId');
    if (!customerId) {
      return c.json({ error: 'Customer ID is required' }, 400);
    }

    // Fetch customer data to get email
    const customerResponse = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      console.error('Failed to fetch customer data:', await customerResponse.text());
      return c.json({ error: 'Failed to fetch customer data' }, 500);
    }

    const customerData = await customerResponse.json() as any;
    const email = customerData.email;
    if (!email) {
      return c.json({ error: 'No email found for customer' }, 400);
    }

    // Create billing portal session
    const portalResponse = await fetch(`https://api.stripe.com/v1/billing_portal/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': customerId,
        'return_url': `https://${c.env.CF_WORKER_DOMAIN}/billing/${customerId}`,
      }).toString(),
    });

    if (!portalResponse.ok) {
      console.error('Failed to create billing portal session:', await portalResponse.text());
      return c.json({ error: 'Failed to create billing portal session' }, 500);
    }

    const portalData = await portalResponse.json() as any;
    const portalUrl = portalData.url;

    // Send email with billing link using nodemailer
    const transporter = nodemailer.createTransport({
      host: c.env.SMTP_HOST,
      port: parseInt(c.env.SMTP_PORT, 10),
      secure: c.env.SMTP_SECURE === 'true',
      auth: {
        user: c.env.SMTP_USERNAME,
        pass: c.env.SMTP_PASSWORD,
      },
    });

    const emailContent = `
      <html>
        <body>
          <h1>Update Your Billing Information</h1>
          <p>Dear Customer,</p>
          <p>You requested a link to update your billing information. Click the link below to access your billing portal:</p>
          <p><a href="${portalUrl}">Update Billing Information</a></p>
          <p>If you did not request this link, please ignore this email.</p>
          <p>Best regards,</p>
          <p>Your Billing Team</p>
        </body>
      </html>
    `;

    const isDevMode = c.env.DEV_MODE === 'true';
    const recipientEmail = isDevMode ? c.env.SMTP_FROM : email;

    console.log(`Sending email to ${recipientEmail} with billing link`);
    await transporter.sendMail({
      from: c.env.SMTP_FROM,
      to: recipientEmail,
      subject: 'Update Your Billing Information',
      html: emailContent,
    });

    console.log(`Email sent to ${recipientEmail} with billing link`);
    return c.json({ message: 'Billing link sent to your email' }, 200);
  } catch (error) {
    console.error('Error sending billing link:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
};
