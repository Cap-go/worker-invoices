# Invoice Sender

This Cloudflare Worker automates the process of sending invoices to customers after a successful charge via Stripe.

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Cap-go/worker-invoices" target="_blank"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"></a>

## Overview

This project uses Cloudflare Workers to listen for Stripe webhooks, specifically for `charge.succeeded` events, and automatically sends an invoice email to the customer with a PDF attachment. It also provides a billing history page for customers to view past charges and resend invoices.

A homepage is available at the root URL (`/`) of your deployed worker, which helps you check the configuration status, including environment variables, webhook setup, and legally required company information in stripe are properly setup.

## Features

- Automatically sends invoices via email upon successful Stripe charges.
- Generates PDF invoices using jsPDF.
- Provides a billing history page for customers.
- Allows manual invoice sending via API endpoints.
- Checks for mandatory legal information before generating invoices.

## Setup

1. **Clone the Repository**: Clone this repository to your local machine.
2. **Install Dependencies**: Run `bun install` to install the necessary dependencies.
3. **Configure Environment Variables**: Set up the required environment variables in your Cloudflare Worker dashboard or in a `.env` file for local development.
   - `STRIPE_API_KEY`: Your Stripe API key. <a href="https://dashboard.stripe.com/apikeys/create?name=InvoiceWorker" target="_blank">Create Stripe API key (use unrestricted key for full access)</a>
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE`: SMTP settings for sending emails.
   - `CF_WORKER_DOMAIN`: Your Cloudflare Worker domain.
   - `DEV_MODE`: Set to 'true' for development mode to send emails to a company email address.
4. **Deploy to Cloudflare**: Use `wrangler deploy` to deploy the worker to Cloudflare.

## Usage

- **Automatic Invoice Sending**: Once deployed, the worker will listen for Stripe `charge.succeeded` events and send invoices automatically.
- **Manual Invoice Sending**: Use the `/api/send-invoice` endpoint with a POST or GET request to manually send an invoice. Parameters required are `customerId` and `chargeId`.
- **Billing History Page**: Customers can access their billing history via a URL like `https://your-worker-domain/billing/<customer-id>`.

## Providing Customers with Invoice URL

To give customers access to their billing history and invoices, you can provide them with a direct link to their billing page. The URL format is `https://your-worker-domain/billing/<customer-id>`. Here's how you can generate and send this link:

1. **The Customer ID**: Use the Stripe customer ID as main identifier
2. **Construct the URL**: Combine your Cloudflare Worker domain with the encoded ID to form the full URL, e.g., `https://your-worker-domain/billing/${customerId}`.
3. **Send the URL**: Include this URL in your communications with the customer, such as in the invoice email (which is already implemented in this project), or through other channels like a customer portal or notification system.

This link will direct the customer to a page where they can view all past charges, download invoices, and access the Stripe billing portal to update their billing information.

## Development

- **Local Testing**: Use `wrangler dev` to run the worker locally for testing.
- **Environment Variables**: Ensure all environment variables are set correctly for local development.

## Troubleshooting

- **Check Logs**: Use Cloudflare logs to troubleshoot issues with webhook processing or email sending.
- **Email Issues**: Verify SMTP settings and ensure the email service is configured correctly.
- **Stripe Webhook**: Ensure the webhook is correctly set up in Stripe to point to your Cloudflare Worker URL.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Stripe Webhook Setup for Auto-Invoicing

The worker automatically sets up the necessary Stripe webhook to listen for `charge.succeeded` events. You don't need to manually configure this in the Stripe Dashboard. The worker runs a scheduled task every minute to ensure the webhook is set up correctly using the `CF_WORKER_DOMAIN` provided. If the webhook is not present, it will be created.

Note: Webhook signature verification is not implemented in this basic setup; for production, consider adding Stripe webhook signature verification for enhanced security.

## API Usage

Send a POST request to `/api/send-invoice` with the following JSON body for manual invoicing:

```json
{
  "customerId": "your-customer-id",
  "chargeId": "your-charge-id"
}
```

Alternatively, use a GET request to `/api/send-invoice?customerId=your-customer-id&chargeId=your-charge-id` to resend an invoice.

The API will fetch Stripe data to brand the email and PDF with the logo and brand color.

## Stripe API Key Permissions

To fetch legally required company information (such as name, address, email, VAT ID, and branding) from Stripe, an **unrestricted API key** is necessary. Restricted keys lack the permissions to access this data, which is critical for generating compliant invoices.

**Note:** While unrestricted keys have broader access, this application is secure for use with them. The code is open and readable, and as the user, you own and control the deployment of this worker. You can verify exactly what the code does with the key.
