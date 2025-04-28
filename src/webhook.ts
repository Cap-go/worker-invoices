export const webhookInit = async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
  try {
    console.log('Scheduled task running to check Stripe webhook setup');
    
    // Fetch existing webhooks from Stripe
    const webhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
      headers: {
        'Authorization': `Bearer ${env.STRIPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!webhookResponse.ok) {
      console.error('Failed to fetch Stripe webhooks:', webhookResponse.status);
      return;
    }

    const webhookData = await webhookResponse.json() as any;
    const webhookUrl = `https://${env.CF_WORKER_DOMAIN}/webhook/stripe`;
    const requiredEvent = 'charge.succeeded';
    const existingWebhook = webhookData.data.find((wh: any) => wh.url === webhookUrl && wh.enabled_events.includes(requiredEvent));

    if (!existingWebhook) {
      console.log('Webhook not found or event not enabled, creating a new one');
      // Delete existing webhook if it exists but doesn't have the required event
      const oldWebhook = webhookData.data.find((wh: any) => wh.url === webhookUrl);
      if (oldWebhook) {
        console.log('Deleting existing webhook without required event:', oldWebhook.id);
        await fetch(`https://api.stripe.com/v1/webhook_endpoints/${oldWebhook.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${env.STRIPE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
      }
      
      // Create a new webhook if not found or after deletion
      const createWebhookResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STRIPE_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'url': webhookUrl,
          'enabled_events[]': requiredEvent,
        }).toString(),
      });

      if (!createWebhookResponse.ok) {
        console.error('Failed to create Stripe webhook:', createWebhookResponse.status);
        return;
      }

      const newWebhook = await createWebhookResponse.json() as any;
      console.log('Webhook created successfully:', newWebhook.id);
    } else {
      console.log('Webhook already exists:', existingWebhook.id);
    }
  } catch (error) {
    console.error('Error in scheduled webhook check:', error);
  }
}
