import { sendEmail } from './email';
import { maskEmail as maskEmailUtil, renderHtml } from './utils';
import { getCustomerData, getCustomerCharges, createBillingPortalSession, getCompanyInfo, getSubscriptionInfo, CompanyInfo, CustomerData, SubscriptionInfo } from './stripe';

export const billing = async (c: any) => {
  try {
    const customerId = c.req.param('customerId');
    
    // Fetch customer data, company info, subscription, and charges in parallel
    const [customerData, companyInfo, subscriptionInfo, charges] = await Promise.all([
      getCustomerData(c, customerId),
      getCompanyInfo(c),
      getSubscriptionInfo(c, customerId),
      getCustomerCharges(c, customerId)
    ]);
    
    const name = customerData.name || 'Customer';
    const email = customerData.email || '';

    // Use the imported maskEmail utility function
    const maskEmail = maskEmailUtil;

    // Generate HTML content for the billing page
    const content = `
      <header class="header">
        <div class="company-info">
          ${companyInfo.logo ? 
            `<img src="${companyInfo.logo}" alt="${companyInfo.name} Logo" class="logo">` : 
            `<svg viewBox="0 0 60 25" xmlns="http://www.w3.org/2000/svg" width="48" height="48" class="logo"><title>Stripe logo</title><path fill="${companyInfo.brandColor}" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 0 0-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z" fill-rule="evenodd"></path></svg>`
          }
          <div class="company-details">
            <span class="company-name">${companyInfo.name !== 'Not Set' ? companyInfo.name : 'Invoice Sender API'}</span>
            <span class="company-meta">${companyInfo.description}</span>
          </div>
        </div>
        ${companyInfo.email !== 'Not Set' && companyInfo.address !== 'Not Set' ? 
          `<div class="company-details">
            <span class="company-meta">Address: ${companyInfo.address}</span>
            ${companyInfo.vatId ? `<span class="company-meta">VAT: ${companyInfo.vatId}</span>` : ''}
          </div>` : ''
        }
      </header>

      <h1 class="page-title">Billing History</h1>
      
      <div class="card">
        <div class="card-header">
          <div class="user-info">
            <div class="user-name">${name}</div>
            ${email ? `<div class="company-meta">${maskEmail(email)}</div>` : ''}
            ${subscriptionInfo ? 
              `<div class="subscription-info">${subscriptionInfo.planName} • ${subscriptionInfo.interval.charAt(0).toUpperCase() + subscriptionInfo.interval.slice(1)}ly • $${subscriptionInfo.amount}/${subscriptionInfo.interval}</div>` : ''
            }
          </div>
          <form id="billingLinkForm" onsubmit="event.preventDefault(); sendFormRequest('billingLinkForm', '/api/request-billing-link?customerId=${customerId}', 'Billing link sent to your email', 'Failed to send billing link');">
            <button type="submit" class="btn btn-primary">Edit Billing Info</button>
          </form>
        </div>
        
        <table class="billing-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${charges.length > 0 ? charges.map((charge: any) => `
              <tr>
                <td>${charge.created ? new Date(charge.created * 1000).toLocaleDateString() : 'N/A'}</td>
                <td class="amount">$${charge.amount ? (charge.amount / 100).toFixed(2) : 'N/A'}</td>
                <td><span class="status-badge status-paid">Paid</span></td>
                <td>
                  <form id="invoiceForm-${charge.id}" onsubmit="event.preventDefault(); sendFormRequest('invoiceForm-${charge.id}', '/api/send-invoice?customerId=${customerId}&chargeId=${charge.id}', 'Invoice sent to your email', 'Failed to send invoice');">
                    <button type="submit" class="action-link">Send Invoice</button>
                  </form>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="4" class="text-center py-4">No charges found for this customer.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;

    return c.html(renderHtml(`Billing History for ${name}`, content, c.env.CF_WORKER_DOMAIN, companyInfo.brandColor, companyInfo.secondaryColor));
  } catch (error) {
    console.error('Error rendering billing page:', error);
    const content = `
      <div class="card">
        <div class="card-body">
          <div class="status-badge status-missing">
            <strong class="font-bold">Error:</strong>
            <span class="block sm:inline">Internal server error.</span>
          </div>
          <div class="mt-6 text-center">
            <a href="javascript:history.back()" class="btn btn-primary">Go Back</a>
          </div>
        </div>
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

    // Fetch customer data and company info in parallel
    const [customerData, companyInfo] = await Promise.all([
      getCustomerData(c, customerId),
      getCompanyInfo(c)
    ]);

    const email = customerData.email;
    if (!email) {
      return c.json({ error: 'No email found for customer' }, 400);
    }

    // Create a billing portal session
    const portalUrl = await createBillingPortalSession(c, customerId, `https://${c.env.CF_WORKER_DOMAIN}/billing/${customerId}`);

    // Send email with billing link using WorkerMailer
    const emailContent = `
      <html>
        <head>
          <style>
            :root {
              --primary: ${companyInfo.brandColor};
              --secondary: ${companyInfo.secondaryColor};
              --text: #1f2937;
              --text-light: #6b7280;
            }
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              color: var(--text);
              background-color: var(--secondary);
              margin: 0;
              padding: 20px;
              line-height: 1.5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: white;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .header {
              padding: 20px;
              background-color: var(--primary);
              color: white;
            }
            .content {
              padding: 30px 20px;
            }
            .logo {
              max-width: 200px;
              margin-bottom: 10px;
            }
            h1 {
              font-size: 24px;
              margin: 0 0 20px;
              color: var(--primary);
            }
            p {
              margin: 0 0 15px;
            }
            .btn {
              display: inline-block;
              background-color: var(--primary);
              color: white !important;
              text-decoration: none;
              padding: 10px 20px;
              border-radius: 4px;
              font-weight: 500;
              margin: 15px 0;
            }
            .footer {
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: var(--text-light);
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${companyInfo.logo ? `<img src="${companyInfo.logo}" alt="${companyInfo.name} Logo" class="logo">` : `<h2>${companyInfo.name}</h2>`}
              ${companyInfo.vatId ? `<div style="margin-top: 5px; font-size: 12px;">VAT: ${companyInfo.vatId}</div>` : ''}
            </div>
            <div class="content">
              <h1>Update Your Billing Information</h1>
              <p>Dear ${customerData.name || 'Customer'},</p>
              <p>You requested a link to update your billing information. Click the button below to access your billing portal:</p>
              <p><a href="${portalUrl}" class="btn">Update Billing Information</a></p>
              <p>If you did not request this link, please ignore this email.</p>
              <p>Best regards,<br>${companyInfo.name} Team</p>
            </div>
            <div class="footer">
              <p>This email was sent by ${companyInfo.name}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email to actual email address
    const isDevMode = c.env.DEV_MODE === 'true';
    const recipientEmail = isDevMode ? 'martindonadieu@gmail.com': email;

    console.log(`Sending email to ${recipientEmail} with billing link`);
    await sendEmail(c, c.env.EMAIL_FROM, recipientEmail, 'Update Your Billing Information', emailContent);
    console.log(`Email sent to ${recipientEmail} with billing link`);
    return c.json({ message: 'Billing link sent to your email' }, 200);
  } catch (error) {
    console.error('Error sending billing link:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
};

// Using maskEmail utility function from utils.ts instead of defining it here
