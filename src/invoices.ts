import { sendEmail } from './email';
import { getCompanyInfo, getSubscriptionInfo, getCustomerData, getChargeData, getFormattedVatNumber, CompanyInfo, CustomerData, SubscriptionInfo, ChargeData, getInvoiceFromCharge } from './stripe';
import { createInvoicePDF } from './pdf';
import { maskEmail, renderHtml } from './utils';

// Helper function to send invoice
export async function sendInvoice(c: any, customerId: string, chargeId: string) {
  // Fetch customer data from Stripe
  console.log('Fetching customer data from Stripe');
  const customerData = await getCustomerData(c, customerId);
  const email = customerData.email || '';
  const name = customerData.name || 'Customer';

  // Fetch specific charge for the customer
  console.log('Fetching charge data from Stripe');
  const chargeData = await getChargeData(c, chargeId);
  const chargeAmount = chargeData.amount ? chargeData.amount / 100 : 'N/A';
  const chargeDate = chargeData.created ? new Date(chargeData.created * 1000).toLocaleDateString() : 'N/A';
  
  // Fetch subscription information if available
  const subscriptionInfo = await getSubscriptionInfo(c, customerId, chargeId);
  
  // Fetch company info for branding and legal information
  const companyInfo = await getCompanyInfo(c);
  
  // Get the needed data from companyInfo
  const logoUrl = companyInfo.logo;
  const brandColor = companyInfo.brandColor;
  const secondaryColor = companyInfo.secondaryColor;
  const companyName = companyInfo.name;
  const companyAddress = companyInfo.address;
  const companyEmail = companyInfo.email;
  const formattedVat = companyInfo.vatId;

  // Get the actual VAT number from the tax ID object
  let formattedVatNumber = await getFormattedVatNumber(c, formattedVat);

  console.log('logoUrl', logoUrl);
  console.log('brandColor', brandColor);
  console.log('secondaryColor', secondaryColor);
  console.log('companyName', companyName);
  console.log('companyAddress', companyAddress);
  console.log('companyEmail', companyEmail);
  console.log('companyVat', formattedVatNumber);
  console.log('c.env.EMAIL_FROM', c.env.EMAIL_FROM);
  console.log('c.env.DEV_MODE', c.env.DEV_MODE);
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
  const mandatoryFieldsMissing = !companyName || !companyAddress || !companyEmail || !formattedVatNumber;
  const recipientEmail = isDevMode ? 'martindonadieu@gmail.com'  : email;

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
    if (!formattedVatNumber) missingFields.push('VAT ID');
    const webhookUrlGet = `https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice?customerId=${customerId}&chargeId=${chargeId}`;
    const webhookUrlPost = `https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice`;
    const notificationContent = `
      <html>
        <head>
          <style>
            :root {
              --primary: ${brandColor};
              --secondary: ${secondaryColor};
              --text: #1f2937;
              --text-light: #6b7280;
              --border: #e5e7eb;
              --danger: #ef4444;
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
              background-color: var(--danger);
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
              color: var(--danger);
            }
            p {
              margin: 0 0 15px;
            }
            .alert {
              background-color: rgba(239, 68, 68, 0.1);
              border-left: 4px solid var(--danger);
              padding: 15px;
              margin-bottom: 20px;
              border-radius: 4px;
            }
            ul {
              margin: 10px 0;
              padding-left: 20px;
            }
            li {
              margin-bottom: 5px;
            }
            pre {
              background-color: #f3f4f6;
              padding: 15px;
              border-radius: 4px;
              overflow-x: auto;
              margin: 15px 0;
              font-family: monospace;
              font-size: 14px;
            }
            .code-block {
              background-color: #1f2937;
              color: white;
              padding: 15px;
              border-radius: 4px;
              overflow-x: auto;
              margin: 15px 0;
              font-family: monospace;
              font-size: 14px;
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
              border-top: 1px solid var(--border);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Invoice Generation Issue</h2>
              ${formattedVatNumber ? `<div style="margin-top: 5px; font-size: 12px;">VAT: ${formattedVatNumber}</div>` : ''}
            </div>
            <div class="content">
              <h1>Invoice Generation Issue for #${invoiceNumber}</h1>
              <div class="alert">
                <p>Mandatory legal information is missing for generating a valid invoice.</p>
              </div>
              <p>The following fields are missing:</p>
              <ul>
                ${missingFields.map(field => `<li>${field}</li>`).join('')}
              </ul>
              <p>Please update your Stripe account with the required business information.</p>
              <p>Once updated, you can resend the invoice using one of the following methods:</p>
              
              <h3>Method 1: GET Request</h3>
              <div class="code-block">${webhookUrlGet}</div>
              
              <h3>Method 2: POST Request</h3>
              <div class="code-block">
              URL: ${webhookUrlPost}
              
              Payload:
              {
                "customerId": "${customerId}",
                "chargeId": "${chargeId}"
              }
              </div>
              
              <p>Update your Stripe account settings at <a href="https://dashboard.stripe.com/settings/account">https://dashboard.stripe.com/settings/account</a></p>
            </div>
            <div class="footer">
              <p>Invoice Sender API</p>
            </div>
          </div>
        </body>
      </html>
    `;
    await sendEmail(c, c.env.EMAIL_FROM, companyEmail, `Invoice Generation Issue #${invoiceNumber}`, notificationContent);
    console.log(`Notification email sent to ${companyEmail} about missing legal fields for invoice #${invoiceNumber}`);
    return c.json({ error: 'Invoice generation halted due to missing mandatory legal information, notification sent to company' }, 500 as any);
  }

  // Construct email content with branding
  const billingUrl = `https://${c.env.CF_WORKER_DOMAIN}/billing/${customerId}`;
  const emailContent = `
    <html>
      <head>
        <style>
          :root {
            --primary: ${brandColor};
            --secondary: ${secondaryColor};
            --text: #1f2937;
            --text-light: #6b7280;
            --border: #e5e7eb;
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
          .invoice-details {
            margin-bottom: 20px;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 15px;
          }
          .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
          }
          .detail-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
          }
          .detail-label {
            font-weight: 500;
            color: var(--text-light);
          }
          .detail-value {
            font-weight: 600;
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
            border-top: 1px solid var(--border);
          }
          a {
            color: var(--primary);
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="${companyName} Logo" class="logo">` : `<h2>${companyName}</h2>`}
            ${formattedVatNumber ? `<div style="margin-top: 5px; font-size: 12px;">VAT: ${formattedVatNumber}</div>` : ''}
          </div>
          <div class="content">
            <h1>Invoice #${invoiceNumber}</h1>
            
            <div class="invoice-details">
              <div class="detail-row">
                <span class="detail-label">Customer:</span>
                <span class="detail-value">${name}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${maskEmail(email)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${chargeDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Amount:</span>
                <span class="detail-value">$${chargeAmount}</span>
              </div>
              ${subscriptionInfo ? `
              <div class="detail-row">
                <span class="detail-label">Subscription:</span>
                <span class="detail-value">${subscriptionInfo.planName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Billing Period:</span>
                <span class="detail-value">${subscriptionInfo.interval.charAt(0).toUpperCase() + subscriptionInfo.interval.slice(1)}ly</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Plan Amount:</span>
                <span class="detail-value">$${subscriptionInfo.amount}/${subscriptionInfo.interval}</span>
              </div>
              ` : ''}
            </div>
            
            <p>Your invoice has been generated and is attached to this email as a PDF.</p>
            
            <p><a href="${billingUrl}" class="btn">View All Billing History</a></p>
            
            <p>Need to update your billing information? <a href="https://billing.stripe.com/p/login/customer/${customerId}">Manage your billing details here</a>.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  console.log('Generating PDF using jsPDF');
  // Use the createInvoicePDF function from pdf.ts
  const pdfBuffer = await createInvoicePDF(companyInfo, { name: name, email: email }, invoiceNumber, chargeData, subscriptionInfo);

  // Send email using nodemailer
  console.log('Sending email to', recipientEmail);
  await sendEmail(c, c.env.EMAIL_FROM, recipientEmail, `Invoice #${invoiceNumber}`, emailContent, [{
    filename: `invoice_${invoiceNumber}.pdf`,
    content: pdfBuffer.toString('base64'),
    mimeType: 'application/pdf',
  }]);

  console.log(`Email sent to ${recipientEmail} with invoice #${invoiceNumber}`);

  return c.json({ message: 'Invoice sent successfully', invoiceNumber });
}
