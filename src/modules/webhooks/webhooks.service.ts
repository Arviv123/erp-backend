import { createHmac } from 'crypto';
import { prisma } from '../../config/database';

/**
 * WEBHOOKS SERVICE
 * Registers, manages, and dispatches webhook events with HMAC-SHA256 signatures.
 * Base44 (or any external system) can receive real-time events.
 */

// ─── Sign Payload ─────────────────────────────────────────────────

function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

// ─── Dispatch Event ───────────────────────────────────────────────

export async function dispatchEvent(
  tenantId: string,
  event:    string,
  data:     Record<string, unknown>
) {
  // Find all active webhooks subscribed to this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      tenantId,
      isActive:     true,
      failureCount: { lt: 10 }, // disable after 10 consecutive failures
    },
  });

  const subscribed = webhooks.filter((wh) => {
    const events = wh.events as string[];
    return events.includes(event) || events.includes('*');
  });

  if (subscribed.length === 0) return [];

  const payload = JSON.stringify({
    event,
    tenantId,
    timestamp: new Date().toISOString(),
    data,
  });

  const results = await Promise.allSettled(
    subscribed.map(wh => deliverWebhook(wh.id, wh.url, wh.secret, event, payload))
  );

  return results;
}

// ─── Deliver Single Webhook ───────────────────────────────────────

async function deliverWebhook(
  webhookId: string,
  url:       string,
  secret:    string,
  event:     string,
  payload:   string
) {
  const signature = signPayload(payload, secret);
  const startTime = Date.now();

  let responseCode = 0;
  let responseBody = '';
  let success      = false;

  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':         'application/json',
        'X-ERP-Signature':      signature,
        'X-ERP-Event':          event,
        'X-ERP-Delivery':       webhookId,
      },
      body:    payload,
      signal:  AbortSignal.timeout(10_000), // 10 second timeout
    });

    responseCode = response.status;
    responseBody = await response.text().catch(() => '');
    success      = response.ok;
  } catch (err: any) {
    responseBody = err.message ?? 'Network error';
  }

  const duration = Date.now() - startTime;

  // Record delivery attempt
  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event,
      payload:      JSON.parse(payload),
      status:       success ? 'SUCCESS' : 'FAILED',
      responseCode,
      responseBody: responseBody.slice(0, 500),
      duration,
    },
  });

  // Update webhook stats
  if (success) {
    await prisma.webhook.update({
      where: { id: webhookId },
      data:  { failureCount: 0, lastDeliveredAt: new Date() },
    });
  } else {
    await prisma.webhook.update({
      where: { id: webhookId },
      data:  { failureCount: { increment: 1 } },
    });
  }

  return { webhookId, success, responseCode, duration };
}

// ─── Retry Failed Delivery ────────────────────────────────────────

export async function retryDelivery(deliveryId: string, tenantId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where:   { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery)                               throw new Error('Delivery not found');
  if (delivery.webhook.tenantId !== tenantId)  throw new Error('Delivery not found');
  if (delivery.status === 'SUCCESS')            throw new Error('Delivery already succeeded');

  const payload = JSON.stringify(delivery.payload);
  return deliverWebhook(
    delivery.webhookId,
    delivery.webhook.url,
    delivery.webhook.secret,
    delivery.event,
    payload
  );
}
