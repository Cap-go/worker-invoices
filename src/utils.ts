/**
 * Utility functions for the invoice sender
 */

/**
 * Masks an email address for privacy
 * Example: john.doe@example.com → jo***e@e**.com
 */
export function maskEmail(email: string): string {
  if (!email) return '';
  
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  
  const name = parts[0];
  const domain = parts[1];
  
  // Show first 2 characters and last character of name part, mask the rest
  let maskedName = '';
  if (name.length <= 3) {
    // For very short names, just show first character
    maskedName = name.charAt(0) + '***';
  } else {
    maskedName = name.substring(0, 2) + '***' + name.charAt(name.length - 1);
  }
  
  // Show domain name but mask part of it
  const domainParts = domain.split('.');
  const domainName = domainParts[0];
  const tld = domainParts.slice(1).join('.');
  
  let maskedDomain = '';
  if (domainName.length <= 3) {
    maskedDomain = '**' + '.' + tld;
  } else {
    maskedDomain = domainName.charAt(0) + '**' + '.' + tld;
  }
  
  return maskedName + '@' + maskedDomain;
}

/**
 * Renders the HTML for a page with the given title and content
 */
export function renderHtml(title: string, content: string, cfWorkerDomain: string, brandColor = '#4f46e5', secondaryColor = '#f3f4f6') {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="icon" type="image/png" href="https://stripe.com/favicon.ico" />
        <style>
          :root {
            --primary: ${brandColor};
            --primary-hover: ${adjustColor(brandColor, -15)};
            --secondary: ${secondaryColor};
            --text: #1f2937;
            --text-light: #6b7280;
            --border: #e5e7eb;
            --success: #10b981;
            --danger: #ef4444;
            --card: #ffffff;
            --background: #f9fafb;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          }
          
          body {
            background-color: var(--background);
            color: var(--text);
            line-height: 1.5;
          }
          
          .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem 1rem;
          }
          
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border);
          }
          
          .company-info {
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          
          .logo {
            width: 48px;
            height: 48px;
            object-fit: contain;
          }
          
          .company-details {
            display: flex;
            flex-direction: column;
          }
          
          .company-name {
            font-weight: 600;
            font-size: 1rem;
            color: var(--text);
          }
          
          .company-meta {
            font-size: 0.875rem;
            color: var(--text-light);
          }
          
          .page-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 1.5rem;
            text-align: center;
            color: var(--primary);
          }
          
          .card {
            background-color: var(--card);
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            margin-bottom: 1.5rem;
          }
          
          .card-header {
            padding: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
          }
          
          .card-body {
            padding: 1.5rem;
          }
          
          .user-info {
            display: flex;
            flex-direction: column;
          }
          
          .user-name {
            font-weight: 600;
            font-size: 1.125rem;
          }
          
          .subscription-info {
            font-size: 0.875rem;
            color: var(--text-light);
            margin-top: 0.25rem;
          }
          
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
            font-weight: 500;
            border-radius: 0.375rem;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
          }
          
          .btn-primary {
            background-color: var(--primary);
            color: white;
            border: none;
          }
          
          .btn-primary:hover {
            background-color: var(--primary-hover);
          }
          
          .billing-table {
            width: 100%;
            border-collapse: collapse;
          }
          
          .billing-table th {
            text-align: left;
            padding: 1rem 1.5rem;
            font-weight: 500;
            font-size: 0.875rem;
            color: var(--text-light);
            background-color: var(--secondary);
            border-bottom: 1px solid var(--border);
          }
          
          .billing-table td {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.875rem;
          }
          
          .billing-table tr:last-child td {
            border-bottom: none;
          }
          
          .billing-table tr:hover {
            background-color: var(--secondary);
          }
          
          .amount {
            font-weight: 500;
          }
          
          .action-link {
            color: var(--primary);
            text-decoration: none;
            font-weight: 500;
          }
          
          .action-link:hover {
            text-decoration: underline;
          }
          
          .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 0.25rem 0.5rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 500;
          }
          
          .status-paid {
            background-color: rgba(16, 185, 129, 0.1);
            color: var(--success);
          }
          
          .status-missing {
            background-color: rgba(239, 68, 68, 0.1);
            color: var(--danger);
          }
          
          .status-set {
            background-color: rgba(16, 185, 129, 0.1);
            color: var(--success);
          }
          
          .footer {
            margin-top: 2rem;
            text-align: center;
            font-size: 0.875rem;
            color: var(--text-light);
          }
          
          .code-block {
            background-color: #1f2937;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.375rem;
            font-family: monospace;
            font-size: 0.875rem;
            overflow-x: auto;
            margin-bottom: 1rem;
          }
          
          .code-keyword {
            color: #ec4899;
          }
          
          .code-url {
            color: #60a5fa;
          }
          
          .code-string {
            color: #ef4444;
          }
          
          .code-property {
            color: #10b981;
          }
          
          .code-bracket {
            color: #fbbf24;
          }
          
          @media (max-width: 768px) {
            .header {
              flex-direction: column;
              align-items: flex-start;
              gap: 1rem;
            }
            
            .card-header {
              flex-direction: column;
              align-items: flex-start;
              gap: 1rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${content}
          <footer class="footer">
            <p>Powered by Invoice Sender API</p>
          </footer>
        </div>
        ${getCopyExampleScript(cfWorkerDomain)}
        ${getFormSubmitScript()}
      </body>
    </html>
  `;
  return html;
}

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number) {
  // Convert hex to RGB
  let r = parseInt(color.substring(1, 3), 16);
  let g = parseInt(color.substring(3, 5), 16);
  let b = parseInt(color.substring(5, 7), 16);
  
  // Adjust brightness
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  // Convert back to hex
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Helper for script generation
function getCopyExampleScript(cfWorkerDomain: string) {
  const html = `<script>
    window.copyApiExample = function(type) {
      var url = 'https://${cfWorkerDomain}/api/send-invoice';
      var body = JSON.stringify({ customerId: 'your-customer-id', chargeId: 'your-charge-id' }, null, 2);
      var text = '';
      if (type === 'curl') {
        text = \`curl -X POST '\${url}' -H 'Content-Type: application/json' -d '\${body.replace(/'/g, "'\\''")}\`\`;
      } else {
        text = \`fetch('\${url}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ customerId: 'your-customer-id', chargeId: 'your-charge-id' })\n})\`;
      }
      navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    };
  </script>`;
  return html;
}

// Helper for form submission script
function getFormSubmitScript() {
  return `<script>
    async function sendFormRequest(formId, endpoint, successMessage = 'Request successful', failureMessage = 'Request failed') {
      const form = document.getElementById(formId);
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
        });
        const result = await response.json();
        if (response.ok) {
          alert(successMessage);
        } else {
          alert(failureMessage + ': ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        alert(failureMessage + ': ' + error.message);
      }
    }
  </script>`;
}
