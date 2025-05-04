import { getWebhookEndpoints, deleteWebhookEndpoint, createWebhookEndpoint } from './stripe';

export const webhookInit = async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
  try {
    console.log('Scheduled task running to check Stripe webhook setup');
    
    // Fetch existing webhooks from Stripe
    const webhookData = await getWebhookEndpoints({ env });
    const webhookUrl = `https://${env.CF_WORKER_DOMAIN}/webhook/stripe`;
    const requiredEvent = 'charge.succeeded';
    const existingWebhook = webhookData.find((wh: any) => wh.url === webhookUrl && wh.enabled_events.includes(requiredEvent));

    if (!existingWebhook) {
      console.log('Webhook not found or event not enabled, creating a new one');
      // Delete existing webhook if it exists but doesn't have the required event
      const oldWebhook = webhookData.find((wh: any) => wh.url === webhookUrl);
      if (oldWebhook) {
        console.log('Deleting existing webhook without required event:', oldWebhook.id);
        await deleteWebhookEndpoint({ env }, oldWebhook.id);
      }
      
      // Create a new webhook if not found or after deletion
      const newWebhook = await createWebhookEndpoint({ env }, webhookUrl, [requiredEvent]);
      console.log('Webhook created successfully:', newWebhook.id);
    } else {
      console.log('Webhook already exists:', existingWebhook.id);
    }
  } catch (error) {
    console.error('Error in scheduled webhook check:', error);
  }
}
