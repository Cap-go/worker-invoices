import jsPDF from "jspdf"
import type { CompanyInfo, CustomerData, ChargeData, SubscriptionInfo } from "./stripe"

/**
 * Creates a PDF invoice with the provided details in Stripe-like style.
 * @param companyInfo - Object containing company details like name, address, email, logo, etc.
 * @param customerData - Object containing customer details like name, email, address.
 * @param invoiceNumber - The unique invoice number.
 * @param chargeData - The Stripe charge object.
 * @param subscriptionInfo - Object containing subscription details if applicable.
 * @returns Buffer containing the PDF data.
 */
export async function createInvoicePDF(
  companyInfo: CompanyInfo,
  customerData: CustomerData,
  invoiceNumber: string,
  chargeData: ChargeData, // Using the actual Stripe.Charge type
  subscriptionInfo: SubscriptionInfo | null = null,
  receiptNumber?: string,
): Promise<Buffer> {
  console.log("Generating PDF using jsPDF")

  // Generate PDF using jsPDF with Stripe-like styling
  const doc = new jsPDF({
    orientation: "p",
    format: "a4",
    unit: "pt",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 50

  // Helper functions
  const setFontStyle = (size: number, style = "normal") => {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
  }

  const drawText = (text: string, x: number, y: number, options: any = {}) => {
    doc.text(text, x, y, options)
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
    return date.toLocaleDateString("en-US", options)
  }

  // Set default text color to dark gray instead of pure black for better readability
  doc.setTextColor(51, 51, 51)

  // Add header with receipt/invoice info
  let currentY = margin

  // Add receipt number and amount at the top
  const datePaid = formatDate(chargeData.created)

  setFontStyle(10)
  drawText(`${receiptNumber || invoiceNumber} · ${chargeData.price_string} paid on ${datePaid}`, margin, currentY)

  // Add "Page 1 of 1" on the right
  drawText("Page 1 of 1", pageWidth - margin, currentY, { align: "right" })

  currentY += 30

  // Add "Receipt" title
  setFontStyle(24, "bold")
  drawText("Receipt", margin, currentY)
  currentY += 40

  // Add invoice details in a two-column layout
  setFontStyle(10, "bold")
  drawText("Invoice number", margin, currentY)
  drawText("Receipt number", margin + 200, currentY)
  currentY += 20

  setFontStyle(10)
  drawText(invoiceNumber, margin, currentY)
  drawText(receiptNumber || invoiceNumber, margin + 200, currentY)
  currentY += 30

  setFontStyle(10, "bold")
  drawText("Date paid", margin, currentY)
  drawText("Payment method", margin + 200, currentY)
  currentY += 20

  setFontStyle(10)
  drawText(datePaid, margin, currentY)

  // Get payment method from Stripe charge
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

  drawText(paymentMethod, margin + 200, currentY)
  currentY += 40

  // Company information
  setFontStyle(10)
  if (companyInfo.name) {
    drawText(companyInfo.name, margin, currentY)
    currentY += 15
  }

  if (companyInfo.address) {
    const addressLines = companyInfo.address.split(", ")
    for (const line of addressLines) {
      drawText(line, margin, currentY)
      currentY += 15
    }
  }

  if (companyInfo.email) {
    drawText(companyInfo.email, margin, currentY)
    currentY += 15
  }

  if (companyInfo.vatId) {
    drawText(`VAT: ${companyInfo.vatId}`, margin, currentY)
    currentY += 15
  }

  currentY += 20

  // Bill to section
  setFontStyle(10, "bold")
  drawText("Bill to", margin, currentY)
  currentY += 20

  setFontStyle(10)
  if (customerData.name) {
    drawText(customerData.name, margin, currentY)
    currentY += 15
  }

  if (customerData.address) {
    if (customerData.address.line1) {
      drawText(customerData.address.line1, margin, currentY)
      currentY += 15
    }

    if (customerData.address.line2) {
      drawText(customerData.address.line2, margin, currentY)
      currentY += 15
    }

    const cityStateZip = [customerData.address.city, customerData.address.state, customerData.address.postal_code]
      .filter(Boolean)
      .join(", ")

    if (cityStateZip) {
      drawText(cityStateZip, margin, currentY)
      currentY += 15
    }

    if (customerData.address.country) {
      drawText(customerData.address.country, margin, currentY)
      currentY += 15
    }
  }

  if (customerData.email) {
    drawText(customerData.email, margin, currentY)
    currentY += 15
  }

  currentY += 20

  // Payment status
  setFontStyle(10)
  drawText(`${chargeData.price_string} paid on ${datePaid}`, margin, currentY)
  currentY += 30

  // Optional custom message from charge description
  if (chargeData.description) {
    drawText(chargeData.description, margin, currentY)
    currentY += 30
  }

  // Table header
  setFontStyle(10, "bold")
  drawText("Description", margin, currentY)
  drawText("Qty", pageWidth - margin - 150, currentY)
  drawText("Unit price", pageWidth - margin - 100, currentY, { align: "right" })
  drawText("Amount", pageWidth - margin, currentY, { align: "right" })

  currentY += 15

  // Draw a light gray line
  doc.setDrawColor(230, 230, 230)
  doc.line(margin, currentY, pageWidth - margin, currentY)

  currentY += 20

  // Table content
  setFontStyle(10)

  // Description
  let description = chargeData.description || `Charge ${chargeData.id}`
  if (subscriptionInfo) {
    description = subscriptionInfo.planName || description
  }

  drawText(description, margin, currentY)

  // Quantity
  drawText("1", pageWidth - margin - 150, currentY)

  // Unit price
  drawText(chargeData.price_string, pageWidth - margin - 100, currentY, { align: "right" })

  // Amount
  drawText(chargeData.price_string, pageWidth - margin, currentY, { align: "right" })

  currentY += 30

  // Draw a light gray line
  doc.setDrawColor(230, 230, 230)
  doc.line(margin, currentY, pageWidth - margin, currentY)

  currentY += 20

  // Totals section
  setFontStyle(10)
  drawText("Subtotal", pageWidth - margin - 100, currentY, { align: "right" })
  drawText(chargeData.price_string, pageWidth - margin, currentY, { align: "right" })

  currentY += 20

  setFontStyle(10, "bold")
  drawText("Total", pageWidth - margin - 100, currentY, { align: "right" })
  drawText(chargeData.price_string, pageWidth - margin, currentY, { align: "right" })

  currentY += 20

  setFontStyle(10)
  drawText("Amount paid", pageWidth - margin - 100, currentY, { align: "right" })
  drawText(chargeData.price_string, pageWidth - margin, currentY, { align: "right" })

  currentY += 40

  // Add subscription info if available
  if (subscriptionInfo) {
    setFontStyle(10)
    drawText("Price plan:", margin, currentY)
    currentY += 20

    drawText(`${subscriptionInfo.price_string} / ${subscriptionInfo.interval || "month"}`, margin + 20, currentY)
    currentY += 30

    if (subscriptionInfo.details) {
      const lines = subscriptionInfo.details.split("\n")
      for (const line of lines) {
        drawText(line, margin + 20, currentY)
        currentY += 15
      }
    }
  }

  // Footer
  const footerY = pageHeight - margin
  setFontStyle(8)
  doc.setTextColor(150, 150, 150)

  // Generate footer text using existing data
  const footerText = `Invoice generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
  drawText(footerText, pageWidth / 2, footerY - 15, { align: "center" })

  if (companyInfo.name) {
    drawText(`© ${new Date().getFullYear()} ${companyInfo.name}. All rights reserved.`, pageWidth / 2, footerY, {
      align: "center",
    })
  }

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"))
  console.log("PDF generated successfully with jsPDF")
  return pdfBuffer
}
