import nodemailer from 'nodemailer';
import jsPDF from 'jspdf';

// Helper function to send invoice
export async function sendInvoice(c: any, customerId: string, chargeId: string) {
  // Fetch customer data from Stripe
  console.log('Fetching customer data from Stripe');
  const stripeResponse = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!stripeResponse.ok) {
    console.log('Failed to fetch customer data from Stripe');
    return c.json({ error: 'Failed to fetch customer data from Stripe' }, stripeResponse.status as any);
  }

  const customerData = await stripeResponse.json() as any;
  const email = customerData.email;
  const name = customerData.name || 'Customer';

  // Fetch specific charge for the customer
  console.log('Fetching charge data from Stripe');
  const chargesResponse = await fetch(`https://api.stripe.com/v1/charges/${chargeId}`, {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!chargesResponse.ok) {
    console.log('Failed to fetch charge data from Stripe');
    return c.json({ error: 'Failed to fetch charge data from Stripe' }, chargesResponse.status as any);
  }

  const chargeData = await chargesResponse.json() as any;
  const chargeAmount = chargeData.amount ? chargeData.amount / 100 : 'N/A';
  const chargeDate = chargeData.created ? new Date(chargeData.created * 1000).toLocaleDateString() : 'N/A';

  // Fetch Stripe account data for branding (logo and color) and company info
  console.log('Fetching Stripe account data');
  const accountResponse = await fetch('https://api.stripe.com/v1/account', {
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!accountResponse.ok) {
    console.log('Failed to fetch Stripe account data');
    return c.json({ error: 'Failed to fetch Stripe account data' }, 500 as any);
  }

  const accountData = await accountResponse.json() as any;
  console.log('Stripe account data fetched successfully');
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
    console.log('Sending notification email to company email');
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

  console.log('Generating PDF using jsPDF');
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
  console.log('Sending email using nodemailer');
  const transporter = nodemailer.createTransport({
    host: c.env.SMTP_HOST,
    port: parseInt(c.env.SMTP_PORT, 10),
    secure: c.env.SMTP_SECURE === 'true', // Use SSL if port is 465
    auth: {
      user: c.env.SMTP_USERNAME,
      pass: c.env.SMTP_PASSWORD,
    },
  });

  console.log('Sending email to', recipientEmail);
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
