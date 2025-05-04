import puppeteer from "@cloudflare/puppeteer"
import type { CompanyInfo, CustomerData, ChargeData, SubscriptionInfo } from "./stripe"

/**
 * Creates a PDF invoice with the provided details in Hyperping-like style.
 * @param c - The context object containing environment variables.
 * @param companyInfo - Object containing company details like name, address, email, logo, etc.
 * @param customerData - Object containing customer details like name, email, address.
 * @param invoiceNumber - The unique invoice number.
 * @param chargeData - The Stripe charge object.
 * @param subscriptionInfo - Object containing subscription details if applicable.
 * @param isInvoice - Whether to generate an invoice (true) or receipt (false).
 * @returns Buffer containing the PDF data.
 */
export async function createInvoicePDF(
  c: any,
  companyInfo: CompanyInfo,
  customerData: CustomerData,
  invoiceNumber: string,
  chargeData: ChargeData,
  subscriptionInfo: SubscriptionInfo | null = null,
): Promise<Buffer> {
  const browser = await puppeteer.launch(c.env.MYBROWSER)
  console.log(`Generating invoice PDF using Puppeteer`)

  // HTML content for the invoice/receipt
  const htmlContent = generateInvoiceHTML(
    companyInfo,
    customerData,
    invoiceNumber,
    chargeData,
    subscriptionInfo,
  )

  // Launch a new page
  const page = await browser.newPage()

  // Set the HTML content
  await page.setContent(htmlContent, { waitUntil: "domcontentloaded" })

  // Generate PDF
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "40px", right: "40px", bottom: "40px", left: "40px" },
  })

  await page.close()

  console.log(`PDF invoice generated successfully with Puppeteer`)
  return pdfBuffer
}

/**
 * Generates HTML content for the invoice
 * @param companyInfo - Company details.
 * @param customerData - Customer details.
 * @param invoiceNumber - Invoice number.
 * @param chargeData - Charge details.
 * @param subscriptionInfo - Subscription details if applicable.
 * @returns HTML string.
 */
function generateInvoiceHTML(
  companyInfo: CompanyInfo,
  customerData: CustomerData,
  invoiceNumber: string,
  chargeData: ChargeData,
  subscriptionInfo: SubscriptionInfo | null,
): string {
  // Format currency and amount
  const currency = chargeData.currency?.toUpperCase() || "USD"
  const amount = (chargeData.amount / 100).toFixed(2)
  const formattedAmount = `$${amount}`
  const formattedAmountWithCurrency = `$${amount} ${currency}`

  // Format dates
  const dateCreated = new Date(chargeData.created * 1000)
  const dateIssued = formatDate(dateCreated)
  const dateDue = formatDate(dateCreated) // For invoices, due date is same as issue date in the example

  // Format dates for display in the header
  const shortDateFormat = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }
  const headerDueDate = shortDateFormat(dateCreated)

  // Get payment method details
  let paymentMethod = "Card"
  if (chargeData.payment_method_details) {
    if (chargeData.payment_method_details.type === "card") {
      const card = chargeData.payment_method_details.card
      paymentMethod = card
        ? `${card.brand?.charAt(0).toUpperCase()}${card.brand?.slice(1) || ""} **** ${card.last4 || ""}`
        : "Card"
    } else if (chargeData.payment_method_details.type) {
      paymentMethod =
        chargeData.payment_method_details.type.charAt(0).toUpperCase() + chargeData.payment_method_details.type.slice(1)
    }
  }

  // Get description and subscription period
  let description = chargeData.description || `Charge ${chargeData.id}`
  let subscriptionPeriod = ""

  if (subscriptionInfo) {
    description = subscriptionInfo.planName || description

    if (subscriptionInfo.current_period_start && subscriptionInfo.current_period_end) {
      const startDate = new Date(subscriptionInfo.current_period_start * 1000)
      const endDate = new Date(subscriptionInfo.current_period_end * 1000)

      const formatShortDate = (date: Date) => {
        return date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      }

      subscriptionPeriod = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
    }
  }

  // Get company and customer VAT numbers with country codes
  const companyVat = companyInfo.vatId ? `VAT ${companyInfo.vatId}` : ""
  const customerVat = customerData.vatId ? `VAT ${customerData.vatId}` : ""

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${invoiceNumber}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #111827;
          line-height: 1.5;
          font-size: 14px;
          padding: 40px;
        }
        
        .container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
        }
        
        .header-left h1 {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 30px;
        }
        
        .header-right {
          text-align: right;
        }
        
        .logo {
          max-height: 40px;
          margin-bottom: 20px;
        }
        
        .invoice-details {
          margin-bottom: 30px;
        }
        
        .invoice-details div {
          margin-bottom: 8px;
        }
        
        .company-details {
          margin-bottom: 30px;
        }
        
        .company-details div {
          margin-bottom: 4px;
        }
        
        .billing-details {
          margin-bottom: 30px;
        }
        
        .billing-details div {
          margin-bottom: 4px;
        }
        
        .columns {
          display: flex;
          justify-content: space-between;
        }
        
        .column {
          flex: 1;
        }
        
        .column-right {
          text-align: right;
        }
        
        .amount-due {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .pay-online {
          display: inline-block;
          color: #6366F1;
          text-decoration: none;
          margin-bottom: 30px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        
        table th {
          text-align: left;
          padding: 10px 0;
          border-bottom: 1px solid #E5E7EB;
          font-weight: 600;
        }
        
        table th:last-child {
          text-align: right;
        }
        
        table td {
          padding: 16px 0;
          vertical-align: top;
        }
        
        table td:last-child {
          text-align: right;
        }
        
        .subscription-period {
          color: #6B7280;
          font-size: 13px;
          margin-top: 4px;
        }
        
        .totals {
          width: 100%;
          border-top: 1px solid #E5E7EB;
          padding-top: 16px;
        }
        
        .totals-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        
        .totals-row.total {
          font-weight: 600;
        }
        
        .totals-row.amount-due {
          font-weight: 600;
        }
        
        .tax-note {
          color: #6B7280;
          margin-bottom: 8px;
        }
        
        .footer {
          margin-top: 60px;
          border-top: 1px solid #E5E7EB;
          padding-top: 16px;
          display: flex;
          justify-content: space-between;
          color: #6B7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-left">
            <h1>Invoice</h1>
          </div>
          <div class="header-right">
            ${companyInfo.logo ? `<img src="${companyInfo.logo}" alt="${companyInfo.name}" class="logo">` : `<h2>${companyInfo.name}</h2>`}
          </div>
        </div>
        
        <div class="columns">
          <div class="column">
            <div class="invoice-details">
              <div><strong>Invoice number</strong> ${invoiceNumber}</div>
              <div><strong>Date of issue</strong> ${dateIssued}</div>
              <div><strong>Date due</strong> ${dateDue}</div>
            </div>
            
            <div class="company-details">
              <div><strong>${companyInfo.name}</strong></div>
              ${
                companyInfo.address
                  ? companyInfo.address
                      .split(", ")
                      .map((line) => `<div>${line}</div>`)
                      .join("")
                  : ""
              }
              <div>${companyInfo.email}</div>
              ${companyVat ? `<div>${companyVat}</div>` : ""}
            </div>
          </div>
          
          <div class="column">
            <div class="billing-details">
              <div><strong>Bill to</strong></div>
              <div>${customerData.name || "Customer"}</div>
              ${customerData.address?.line1 ? `<div>${customerData.address.line1}</div>` : ""}
              ${customerData.address?.line2 ? `<div>${customerData.address.line2}</div>` : ""}
              ${customerData.address?.city ? `<div>${customerData.address.postal_code || ""} ${customerData.address.city}</div>` : ""}
              ${customerData.address?.country ? `<div>${customerData.address.country}</div>` : ""}
              <div>${customerData.email}</div>
              ${customerVat ? `<div>${customerVat}</div>` : ""}
            </div>
          </div>
        </div>
        
        <div class="amount-due">
          ${formattedAmountWithCurrency} paid ${headerDueDate}
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                ${description}
                ${subscriptionPeriod ? `<div class="subscription-period">${subscriptionPeriod}</div>` : ""}
              </td>
              <td>1</td>
              <td>${formattedAmount}</td>
              <td>${formattedAmount}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="totals">
          <div class="totals-row">
            <div>Subtotal</div>
            <div>${formattedAmount}</div>
          </div>
          
          ${customerVat ? `<div class="tax-note">Tax to be paid on reverse charge basis</div>` : ""}
          
          <div class="totals-row total">
            <div>Total</div>
            <div>${formattedAmount}</div>
          </div>
          
          <div class="totals-row amount-due">
            <div>Amount paid</div>
            <div>${formattedAmountWithCurrency}</div>
          </div>
        </div>
        
        <div class="footer">
          <div>${invoiceNumber} · ${formattedAmountWithCurrency} paid ${headerDueDate}</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Formats a date object into a readable date string.
 * @param date - Date object.
 * @returns Formatted date string.
 */
function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
  return date.toLocaleDateString("en-US", options)
}
