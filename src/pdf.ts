import jsPDF from 'jspdf';
import { CompanyInfo, CustomerData, ChargeData, SubscriptionInfo } from './stripe';

/**
 * Creates a PDF invoice with the provided details.
 * @param companyInfo - Object containing company details like name, address, email, logo, etc.
 * @param customerData - Object containing customer details like name, email, address.
 * @param invoiceNumber - The unique invoice number.
 * @param chargeData - Object containing charge details like amount, date, ID.
 * @param subscriptionInfo - Object containing subscription details if applicable.
 * @returns Buffer containing the PDF data.
 */
export async function createInvoicePDF(companyInfo: CompanyInfo, customerData: CustomerData, invoiceNumber: string, chargeData: ChargeData, subscriptionInfo: SubscriptionInfo | null = null): Promise<Buffer> {
  console.log('Generating PDF using jsPDF');
  // Generate PDF using jsPDF with Stripe-like styling
  const doc = new jsPDF({
    orientation: 'p',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

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
  doc.setFillColor(companyInfo.secondaryColor);
  doc.rect(0, 0, pageWidth, 40, 'F');

  // Set brand color for text
  doc.setTextColor(companyInfo.brandColor);

  // Add logo if available
  let currentY = 15;
  if (companyInfo.logo) {
    try {
      // Fetch the logo image
      const response = await fetch(companyInfo.logo);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const logoBase64 = Buffer.from(arrayBuffer).toString('base64');
        const imageType = companyInfo.logo.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';
        
        // Add logo to PDF
        doc.addImage(logoBase64, imageType, 20, 10, 40, 20);
        currentY = 35;
      }
    } catch (error) {
      console.error('Error adding logo to PDF:', error);
    }
  }

  doc.setFont('helvetica');
  setFontType('bold');
  doc.setFontSize(18);
  if (companyInfo.name) {
    if (!companyInfo.logo) {
      docText(20, 20, companyInfo.name);
      currentY = 20;
    }
  }
  docText(-20, 20, `Invoice #${invoiceNumber}`);

  setFontType('normal');
  doc.setFontSize(10);
  doc.setLineHeightFactor(1.3);
  
  // Increment currentY for company details
  currentY += 6;
  
  if (companyInfo.address) {
    docText(20, currentY, companyInfo.address.split(', ')[0] || '');
    currentY += 6;
    if (companyInfo.address.split(', ')[1]) {
      docText(20, currentY, companyInfo.address.split(', ')[1]);
      currentY += 6;
    }
  }
  
  if (companyInfo.vatId) {
    docText(20, currentY, `VAT: ${companyInfo.vatId}`);
    currentY += 6;
  }
  
  if (companyInfo.email) {
    docText(20, currentY, `Email: ${companyInfo.email}`);
  }
  
  docText(-20, 26, `Date: ${dateToday}`);

  // Reset text color to black for body content
  doc.setTextColor(0, 0, 0);

  // Customer information section
  currentY = 50;
  setFontType('bold');
  doc.setFontSize(12);
  docText(20, currentY, 'BILL TO:');
  currentY += 6;
  setFontType('normal');
  doc.setFontSize(10);

  const name = customerData.name || 'Customer';
  if (name) {
    docText(20, currentY, name);
    currentY += 6;
  }
  
  if (customerData.address?.line1) {
    docText(20, currentY, customerData.address.line1);
    currentY += 6;
  }
  
  if (customerData.address?.city || customerData.address?.state || customerData.address?.postal_code) {
    docText(20, currentY, `${customerData.address?.city || ''}${customerData.address?.city && customerData.address?.state ? ', ' : ''}${customerData.address?.state || ''} ${customerData.address?.postal_code || ''}`);
    currentY += 6;
  }
  
  if (customerData.address?.country) {
    docText(20, currentY, customerData.address.country);
    currentY += 6;
  }
  
  docText(20, currentY, `Email: ${customerData.email || 'N/A'}`);
  currentY += 10;

  // Add subscription information if available
  if (subscriptionInfo) {
    setFontType('bold');
    doc.setFontSize(12);
    docText(20, currentY, 'SUBSCRIPTION:');
    currentY += 6;
    setFontType('normal');
    doc.setFontSize(10);
    docText(20, currentY, `Plan: ${subscriptionInfo.planName}`);
    currentY += 6;
    docText(20, currentY, `Billing: ${subscriptionInfo.interval.charAt(0).toUpperCase() + subscriptionInfo.interval.slice(1)}ly`);
    currentY += 6;
    docText(20, currentY, `Amount: $${subscriptionInfo.amount}/${subscriptionInfo.interval}`);
    currentY += 10;
  }

  // Table header with brand color background
  currentY = Math.max(currentY, 85);
  doc.setFillColor(companyInfo.brandColor);
  doc.rect(20, currentY, pageWidth - 40, 10, 'F');
  doc.setTextColor(255, 255, 255); // White text for header
  setFontType('bold');
  docText(25, currentY + 6, 'Description');
  docText(-25, currentY + 6, 'Amount');

  // Reset text color for table content
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.1);
  currentY += 10;
  doc.line(20, currentY, pageWidth - 20, currentY);
  currentY += 6;

  setFontType('normal');
  
  // Add payment description with subscription info if available
  const chargeAmount = chargeData.amount ? (chargeData.amount / 100).toFixed(2) : 'N/A';
  let description = `Payment for Charge ID ${chargeData.id}`;
  if (subscriptionInfo) {
    description += ` (${subscriptionInfo.planName} Subscription)`;
  }
  
  docText(25, currentY, description);
  docText(-25, currentY, `$${chargeAmount}`);
  currentY += 6;
  
  const chargeDate = chargeData.created ? new Date(chargeData.created * 1000).toLocaleDateString() : 'N/A';
  docText(25, currentY, `Date: ${chargeDate}`);
  currentY += 14;

  // Total row with light background
  doc.setFillColor(companyInfo.secondaryColor);
  doc.rect(20, currentY, pageWidth - 40, 10, 'F');
  setFontType('bold');
  docText(-25, currentY + 6, `Total: $${chargeAmount}`);
  currentY += 20;

  // Add footer with website and additional info
  setFontType('normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const footerText = `Invoice generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
  doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
  
  if (companyInfo.name) {
    doc.text(`© ${new Date().getFullYear()} ${companyInfo.name}. All rights reserved.`, pageWidth / 2, pageHeight - 6, { align: 'center' });
  }

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  console.log('PDF generated successfully with jsPDF');
  return pdfBuffer;
}
