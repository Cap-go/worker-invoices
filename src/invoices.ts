import { sendEmail } from "./email"
import { getCompanyInfo, getSubscriptionInfo, getCustomerData, getChargeData, getFormattedVatNumber } from "./stripe"
import { createInvoicePDF } from "./pdf"

// Helper function to send invoice
export async function sendInvoice(c: any, customerId: string, chargeId: string) {
  // Fetch customer data from Stripe
  console.log("Fetching customer data from Stripe")
  const customerData = await getCustomerData(c, customerId)
  const email = customerData.email || ""
  const name = customerData.name || "Customer"

  // Fetch specific charge for the customer
  console.log("Fetching charge data from Stripe")
  const chargeData = await getChargeData(c, chargeId)
  const chargeDate = chargeData.created
    ? formatDateInWords(new Date(chargeData.created * 1000))
    : "N/A"

  // Fetch subscription information if available
  const subscriptionInfo = await getSubscriptionInfo(c, customerId, chargeId)

  // Fetch company info for branding and legal information
  const companyInfo = await getCompanyInfo(c)

  // Get the needed data from companyInfo
  const logoUrl = companyInfo.logo
  const brandColor = companyInfo.brandColor
  const secondaryColor = companyInfo.secondaryColor
  const companyName = companyInfo.name
  const companyAddress = companyInfo.address
  const companyEmail = companyInfo.email
  const formattedVat = companyInfo.vatId

  // Get the actual VAT number from the tax ID object
  const formattedVatNumber = await getFormattedVatNumber(c, formattedVat)

  console.log("logoUrl", logoUrl)
  console.log("brandColor", brandColor)
  console.log("secondaryColor", secondaryColor)
  console.log("companyName", companyName)
  console.log("companyAddress", companyAddress)
  console.log("companyEmail", companyEmail)
  console.log("companyVat", formattedVatNumber)
  console.log("c.env.EMAIL_FROM", c.env.EMAIL_FROM)
  console.log("c.env.DEV_MODE", c.env.DEV_MODE)

  // Generate or increment invoice number for this customer using date and customerId
  const currentDate = new Date()
  const datePart =
    currentDate.getFullYear().toString().slice(-2) +
    (currentDate.getMonth() + 1).toString().padStart(2, "0") +
    currentDate.getDate().toString().padStart(2, "0")
  // Create a simple hash of customerId to a number between 0 and 100000
  let hash = 0
  for (let i = 0; i < customerId.length; i++) {
    hash = (hash * 31 + customerId.charCodeAt(i)) % 100000
  }
  const invoiceNumber = `${datePart}${hash.toString().padStart(5, "0")}`
  // Generate a receipt number (different format from invoice number)
  const receiptNumber = `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`

  // Check for mandatory legal fields for invoice
  const isDevMode = c.env.DEV_MODE === "true"
  const mandatoryFieldsMissing = !companyName || !companyAddress || !companyEmail || !formattedVatNumber
  const recipientEmail = isDevMode ? "martindonadieu@gmail.com" : email

  if (mandatoryFieldsMissing && !companyEmail) {
    console.log("Mandatory legal fields for invoice are missing and no company email available to notify.")
    return c.json({ error: "Unable to generate invoice due to missing mandatory legal information" }, 500 as any)
  }

  if (mandatoryFieldsMissing) {
    console.log(`Mandatory legal fields missing, sending notification to company email: ${companyEmail}`)
    const missingFields = []
    if (!companyName) missingFields.push("Company Name")
    if (!companyAddress) missingFields.push("Company Address")
    if (!companyEmail) missingFields.push("Company Email")
    if (!formattedVatNumber) missingFields.push("VAT ID")
    const webhookUrlGet = `https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice?customerId=${customerId}&chargeId=${chargeId}`
    const webhookUrlPost = `https://${c.env.CF_WORKER_DOMAIN}/api/send-invoice`
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
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              color: var(--text);
              background-color: #f9fafb;
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
              ${formattedVatNumber ? `<div style="margin-top: 5px; font-size: 12px;">VAT: ${formattedVatNumber}</div>` : ""}
            </div>
            <div class="content">
              <h1>Invoice Generation Issue for #${invoiceNumber}</h1>
              <div class="alert">
                <p>Mandatory legal information is missing for generating a valid invoice.</p>
              </div>
              <p>The following fields are missing:</p>
              <ul>
                ${missingFields.map((field) => `<li>${field}</li>`).join("")}
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
    `
    await sendEmail(
      c,
      c.env.EMAIL_FROM,
      companyEmail,
      `Invoice Generation Issue #${invoiceNumber}`,
      notificationContent,
    )
    console.log(`Notification email sent to ${companyEmail} about missing legal fields for invoice #${invoiceNumber}`)
    return c.json(
      { error: "Invoice generation halted due to missing mandatory legal information, notification sent to company" },
      500 as any,
    )
  }

  // Format the amount for display
  const formattedAmount = chargeData.price_string || `$${(chargeData.amount / 100).toFixed(2)}`

  // Get payment method details
  let paymentMethodDisplay = "Card"
  let lastFour = ""

  if (chargeData.payment_method_details && chargeData.payment_method_details.type === "card") {
    const card = chargeData.payment_method_details.card
    if (card && card.brand && card.last4) {
      paymentMethodDisplay = card.brand.toUpperCase()
      lastFour = card.last4
    }
  }

  // Get billing period if subscription exists
  let billingPeriod = ""
  if (subscriptionInfo && subscriptionInfo.current_period_start && subscriptionInfo.current_period_end) {
    const startDate = new Date(subscriptionInfo.current_period_start * 1000)
    const endDate = new Date(subscriptionInfo.current_period_end * 1000)

    const formatDate = (date: Date): string => {
      return formatDateInWords(date).toUpperCase()
    }

    billingPeriod = `${formatDate(startDate)} – ${formatDate(endDate)}`
  }

  // Construct email content with Stripe-like styling
  const billingUrl = `https://${c.env.CF_WORKER_DOMAIN}/billing/${customerId}`
  const stripeCustomerPortalUrl = `https://billing.stripe.com/p/login/customer/${customerId}`

  const emailContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt from ${companyName}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1a1a1a;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: none;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          .wrapper {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
          }
          .header {
            padding: 20px;
          }
          .logo {
            border-radius: 100%;
            max-height: 40px;
            max-width: 180px;
          }
          .company-name {
            font-size: 20px;
            font-weight: 600;
            margin: 0;
          }
          .content {
            padding: 20px;
          }
          .receipt-header {
            margin-bottom: 20px;
          }
          .receipt-title {
            font-size: 16px;
            color: #666;
            font-weight: normal;
            margin: 0 0 10px 0;
          }
          .amount {
            font-size: 36px;
            font-weight: 600;
            margin: 0 0 5px 0;
          }
          .date {
            color: #666;
            margin: 0;
          }
          .divider {
            height: 1px;
            background-color: #e6e6e6;
            margin: 20px 0;
          }
          .download-links {
            margin-bottom: 20px;
          }
          .download-link {
            color: #635bff;
            text-decoration: none;
            display: inline-block;
            margin-right: 20px;
          }
          .download-link svg {
            vertical-align: middle;
            margin-right: 5px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .info-table td {
            padding: 10px 0;
            vertical-align: top;
          }
          .info-table td:first-child {
            color: #666;
            width: 40%;
          }
          .info-table td:last-child {
            text-align: right;
            font-weight: 500;
          }
          .receipt-details {
            margin-top: 30px;
          }
          .receipt-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
          }
          .receipt-item-description {
            flex: 1;
          }
          .receipt-item-qty {
            width: 50px;
            text-align: center;
          }
          .receipt-item-amount {
            width: 100px;
            text-align: right;
            font-weight: 500;
          }
          .receipt-total {
            margin-top: 20px;
            border-top: 1px solid #e6e6e6;
            padding-top: 20px;
          }
          .receipt-total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
          }
          .receipt-total-label {
            color: #666;
          }
          .receipt-total-amount {
            font-weight: 500;
          }
          .footer {
            text-align: center;
            color: #666;
            font-size: 13px;
            margin-top: 30px;
          }
          .footer a {
            color: #635bff;
            text-decoration: none;
          }
          .powered-by {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 13px;
          }
          .powered-by img {
            height: 20px;
            vertical-align: middle;
          }
          @media (max-width: 600px) {
            .wrapper {
              padding: 20px 10px;
            }
            .amount {
              font-size: 30px;
            }
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <!-- Company Header -->
          <div class="header">
            ${
              logoUrl
                ? `<img src="${logoUrl}" alt="${companyName}" class="logo">`
                : `<h1 class="company-name">${companyName}</h1>`
            }
          </div>
          
          <!-- Main Receipt Container -->
          <div class="container">
            <div class="content">
              <!-- Receipt Header -->
              <div class="receipt-header">
                <h2 class="receipt-title">Receipt from ${companyName}</h2>
                <h1 class="amount">${formattedAmount}</h1>
                <p class="date">Paid ${chargeDate}</p>
              </div>
              
              <div class="divider"></div>
              
              <!-- Receipt Information -->
              <table class="info-table">
                <tr>
                  <td>Receipt number</td>
                  <td>${receiptNumber}</td>
                </tr>
                <tr>
                  <td>Invoice number</td>
                  <td>${invoiceNumber}</td>
                </tr>
                <tr>
                  <td>Payment method</td>
                  <td>
                    ${paymentMethodDisplay}
                    ${lastFour ? ` - ${lastFour}` : ""}
                  </td>
                </tr>
              </table>
              
              <!-- Receipt Details -->
              <div class="receipt-details">
                ${billingPeriod ? `<h3 style="margin-top: 0; color: #666; font-weight: normal; font-size: 14px;">${billingPeriod}</h3>` : ""}
                
                <!-- Item Details -->
                <div class="receipt-item">
                  <div class="receipt-item-description">
                    ${subscriptionInfo ? subscriptionInfo.planName : chargeData.description || "Charge"}
                  </div>
                  <div class="receipt-item-qty">1</div>
                  <div class="receipt-item-amount">${formattedAmount}</div>
                </div>
                
                ${
                  false
                    ? `<div style="color: #666; font-size: 14px; margin: 10px 0;">Tax to be paid on reverse charge basis</div>`
                    : ""
                }
                
                <!-- Totals -->
                <div class="receipt-total">
                  <div class="receipt-total-row">
                    <div class="receipt-total-label">Subtotal</div>
                    <div class="receipt-total-amount">${formattedAmount}</div>
                  </div>
                  
                  <div class="receipt-total-row">
                    <div class="receipt-total-label">Total</div>
                    <div class="receipt-total-amount">${formattedAmount}</div>
                  </div>
                  
                  <div class="receipt-total-row">
                    <div class="receipt-total-label">Amount paid</div>
                    <div class="receipt-total-amount">${formattedAmount}</div>
                  </div>
                </div>
              </div>
              
              <!-- Contact Information -->
              <div style="margin-top: 30px; color: #666; font-size: 14px;">
                Questions? Contact us at <a href="mailto:${companyEmail}" style="color: #635bff; text-decoration: none;">${companyEmail}</a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `

  console.log("Generating PDF using jsPDF")
  // Use the createInvoicePDF function from pdf.ts
  const pdfBuffer = await createInvoicePDF(
    c,
    companyInfo,
    { name: name, email: email, address: customerData.address, vatId: customerData.vatId },
    invoiceNumber,
    chargeData,
    subscriptionInfo,
    receiptNumber,
    true,
  )

  // Send email using nodemailer
  console.log("Sending email to", recipientEmail)
  await sendEmail(c, c.env.EMAIL_FROM, recipientEmail, `Receipt from ${companyName}`, emailContent, [
    {
      filename: `invoice_${invoiceNumber}.pdf`,
      content: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    },
  ])

  console.log(`Email sent to ${recipientEmail} with invoice #${invoiceNumber}`)

  return c.json({ message: "Invoice sent successfully", invoiceNumber, receiptNumber })
}

// Add function to format date in words
function formatDateInWords(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}
