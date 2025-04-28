import { Hono } from 'hono';
import { logger } from 'hono/logger'
import { sendInvoice } from './invoices';
import { home } from './home';
import { billing } from './billing';
import { webhookInit } from './webhook';

const app = new Hono<{ 
  Bindings: { 
    STRIPE_API_KEY: string; 
    SMTP_HOST: string; 
    SMTP_PORT: string; 
    SMTP_USERNAME: string; 
    SMTP_PASSWORD: string; 
    SMTP_FROM: string; 
    SMTP_SECURE: string;
    CF_WORKER_DOMAIN: string; 
    DEV_MODE: string 
  }
}>();

app.use('*', logger());

// API endpoint for sending invoices manually
app.post('/api/send-invoice', async (c) => {
  try {
    const { customerId, chargeId } = await c.req.json();
    
    if (!customerId) {
      return c.json({ error: 'Customer ID is required' }, 400 as any);
    }
    if (!chargeId) {
      return c.json({ error: 'Charge ID is required' }, 400 as any);
    }

    return await sendInvoice(c, customerId, chargeId);
  } catch (error) {
    console.error('Error processing manual invoice:', error);
    return c.json({ error: 'Internal server error' }, 500 as any);
  }
});

// Homepage to explain API usage, portal, webhook configuration, and status
app.get('/', home);

// Homepage to list past charges for a customer
app.get('/billing/:customerId', billing);

// Webhook endpoint for Stripe to auto-send invoices after a successful charge
app.post('/webhook/stripe', async (c) => {
  try {
    const body = await c.req.json();
    
    // Verify webhook signature (in a real implementation, use Stripe's webhook signature verification)
    console.log('Webhook received:', body.type);
    
    if (body.type === 'charge.succeeded') {
      const charge = body.data.object;
      const customerId = charge.customer;
      const chargeId = charge.id;
      
      if (customerId && chargeId) {
        return await sendInvoice(c, customerId, chargeId);
      } else {
        console.log('No customer ID or charge ID found in charge:', charge.id);
        return c.json({ message: 'No customer ID or charge ID found' }, 200 as any);
      }
    }
    
    return c.json({ message: 'Webhook processed' }, 200 as any);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({ error: 'Internal server error' }, 500 as any);
  }
});

// Scheduled task to check and add Stripe webhook if not present
export default {
  scheduled: webhookInit,
  fetch: app.fetch,
};
