/**
 * Webhooks Service Unit Tests
 * Tests HMAC signature generation (pure function — no DB or network).
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';

// ─── Re-implement sign logic for testing (mirrors webhooks.service.ts) ────

function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

describe('Webhook HMAC Signature', () => {

  it('produces sha256= prefixed hex string', () => {
    const sig = signPayload('{"event":"test"}', 'my-secret');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('same payload + same secret → same signature (deterministic)', () => {
    const payload = JSON.stringify({ event: 'invoice.created', data: { id: '123' } });
    const secret  = 'shared-secret-key';

    const sig1 = signPayload(payload, secret);
    const sig2 = signPayload(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('different payloads → different signatures', () => {
    const secret = 'shared-secret';
    const sig1   = signPayload('{"event":"invoice.created"}', secret);
    const sig2   = signPayload('{"event":"invoice.paid"}',    secret);

    expect(sig1).not.toBe(sig2);
  });

  it('different secrets → different signatures for same payload', () => {
    const payload = '{"event":"test"}';
    const sig1    = signPayload(payload, 'secret-one');
    const sig2    = signPayload(payload, 'secret-two');

    expect(sig1).not.toBe(sig2);
  });

  it('signature verification: can verify with same secret', () => {
    const payload  = '{"event":"payroll.approved","tenantId":"t1"}';
    const secret   = 'erp-webhook-secret-2026';
    const signature = signPayload(payload, secret);

    // Verify by re-computing
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(signature).toBe('sha256=' + expected);
  });

  it('tampering with payload changes signature (integrity check)', () => {
    const secret  = 'my-secret';
    const original = '{"amount":1000}';
    const tampered = '{"amount":9999}';

    const sigOriginal = signPayload(original, secret);
    const sigTampered = signPayload(tampered, secret);

    expect(sigOriginal).not.toBe(sigTampered);
  });

  it('empty payload has valid signature', () => {
    const sig = signPayload('', 'secret');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('signature is exactly 71 chars (7 prefix + 64 hex)', () => {
    const sig = signPayload('test', 'secret');
    expect(sig.length).toBe(7 + 64); // "sha256=" + 64 hex chars
  });
});

// ─── Event Filtering Logic ────────────────────────────────────────

describe('Webhook Event Filtering', () => {
  function isSubscribed(webhookEvents: string[], eventName: string): boolean {
    return webhookEvents.includes(eventName) || webhookEvents.includes('*');
  }

  it('wildcard "*" matches any event', () => {
    expect(isSubscribed(['*'], 'invoice.created')).toBe(true);
    expect(isSubscribed(['*'], 'payroll.paid')).toBe(true);
    expect(isSubscribed(['*'], 'anything.at.all')).toBe(true);
  });

  it('specific event matches only that event', () => {
    expect(isSubscribed(['invoice.created'], 'invoice.created')).toBe(true);
    expect(isSubscribed(['invoice.created'], 'invoice.paid')).toBe(false);
  });

  it('multiple events — matches any of them', () => {
    const events = ['invoice.created', 'invoice.paid', 'payroll.approved'];
    expect(isSubscribed(events, 'invoice.created')).toBe(true);
    expect(isSubscribed(events, 'payroll.approved')).toBe(true);
    expect(isSubscribed(events, 'employee.created')).toBe(false);
  });

  it('empty event list matches nothing', () => {
    expect(isSubscribed([], 'invoice.created')).toBe(false);
  });
});
