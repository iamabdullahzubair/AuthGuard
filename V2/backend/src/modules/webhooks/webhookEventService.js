import { enqueueWebhookEvent } from './webhookRepository.js';

// Call with the same transaction client used for the domain change that emitted the event.
export function recordWebhookEvent(client, { tenantId, event, data }) {
  return enqueueWebhookEvent(client, { tenantId, event, data });
}
