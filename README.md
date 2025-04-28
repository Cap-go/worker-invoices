# Invoice Sender

This Cloudflare Worker automates the process of sending invoices to customers after a successful charge via Stripe.

## Overview

This project uses Cloudflare Workers to listen for Stripe webhooks, specifically for `charge.succeeded` events, and automatically sends an invoice email to the customer with a PDF attachment. It also provides a billing history page for customers to view past charges and resend invoices.

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
   - `STRIPE_API_KEY`: Your Stripe API key.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`: SMTP settings for sending emails.
   - `CF_WORKER_DOMAIN`: Your Cloudflare Worker domain.
   - `DEV_MODE`: Set to 'true' for development mode to send emails to a company email address.
4. **Deploy to Cloudflare**: Use `wrangler deploy` to deploy the worker to Cloudflare.

## Usage

- **Automatic Invoice Sending**: Once deployed, the worker will listen for Stripe `charge.succeeded` events and send invoices automatically.
- **Manual Invoice Sending**: Use the `/api/send-invoice` endpoint with a POST or GET request to manually send an invoice. Parameters required are `customerId` and `chargeId`.
- **Billing History Page**: Customers can access their billing history via a URL like `https://your-worker-domain/billing/<base64-encoded-customer-id>`.

## Providing Customers with Invoice URL

To give customers access to their billing history and invoices, you can provide them with a direct link to their billing page. The URL format is `https://your-worker-domain/billing/<base64-encoded-customer-id>`. Here's how you can generate and send this link:

1. **Encode the Customer ID**: Use a base64 encoding function to encode the customer's Stripe ID. In JavaScript, you can use `btoa(customerId)` to achieve this.
2. **Construct the URL**: Combine your Cloudflare Worker domain with the encoded ID to form the full URL, e.g., `https://your-worker-domain/billing/${btoa(customerId)}`.
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

To automatically send invoices after a successful charge:

1. In your Stripe Dashboard, go to **Webhooks** and click **Add endpoint**.
2. Set the endpoint URL to `https://your-worker-url/webhook/stripe`.
3. Select the event `charge.succeeded` to listen for successful charges.
4. Save the webhook. (Note: Webhook signature verification is not implemented in this basic setup; for production, add Stripe webhook signature verification.)

The worker also runs a scheduled task every minute to ensure the webhook is set up in Stripe. If not present, it will attempt to create it using the `CF_WORKER_DOMAIN` provided.

## API Usage

Send a POST request to `/api/send-invoice` with the following JSON body for manual invoicing:

```json
{
  "customerId": "your-customer-id",
  "apiKey": "your-invoice-api-key",
  "additionalInfo": "any-additional-info"
}
```

The API will fetch Stripe data to brand the email and PDF with the logo and brand color. 
