import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'crypto';

export { uuidv4 };

export function generateCorrelationId(): string {
  return uuidv4();
}

export function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export function computeWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  const payload = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}
