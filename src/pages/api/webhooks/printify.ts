import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { insertToken } from '../../../lib/reviews';
import { allProducts } from '../../../types/product';

interface PrintifyShipmentEvent {
  type: string;
  data?: {
    order?: {
      external_id?: string;
      address_to?: { email?: string };
      metadata?: { stripe_payment_intent_id?: string; product_slug?: string };
    };
  };
}

function randomToken(length = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) out += chars[buf[i] % chars.length];
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const POST: APIRoute = async ({ request }) => {
  // Shared-secret guard. Printify webhooks aren't signed, so we gate the endpoint
  // on a query-string key configured in Printify's webhook URL and bound as a
  // Cloudflare secret. Without this, anyone POSTing a plausible body can mint
  // review tokens + burn Brevo quota.
  const expectedKey = (env as any).PRINTIFY_WEBHOOK_SECRET as string | undefined;
  const providedKey = new URL(request.url).searchParams.get('key') ?? '';
  if (!expectedKey || !constantTimeEqual(providedKey, expectedKey)) {
    return new Response('forbidden', { status: 403 });
  }

  const event = (await request.json()) as PrintifyShipmentEvent;

  if (event.type !== 'order:shipment:created') {
    return new Response('ignored', { status: 200 });
  }

  const order = event.data?.order;
  const buyerEmail = order?.address_to?.email;
  const stripePiId = order?.metadata?.stripe_payment_intent_id;
  const productSlug = order?.metadata?.product_slug;

  if (!buyerEmail || !stripePiId || !productSlug) {
    return new Response('missing required fields', { status: 400 });
  }

  const DB = (env as any).DB;
  const REVIEW_EMAILS_QUEUE = (env as any).REVIEW_EMAILS_QUEUE;

  if (!DB || !REVIEW_EMAILS_QUEUE) {
    console.error('printify webhook misconfigured: missing DB or REVIEW_EMAILS_QUEUE binding');
    return new Response('misconfigured', { status: 503 });
  }

  // Sanity check product exists
  if (!allProducts.find((p) => p.slug === productSlug)) {
    return new Response(`unknown product: ${productSlug}`, { status: 400 });
  }

  const token = randomToken(32);
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

  await insertToken(DB, {
    token,
    stripe_payment_intent_id: stripePiId,
    product_slug: productSlug,
    buyer_email: buyerEmail,
    expires_at: expiresAt,
  });

  // Enqueue email with 7-day delay
  await REVIEW_EMAILS_QUEUE.send(
    { token, buyer_email: buyerEmail, product_slug: productSlug },
    { delaySeconds: 7 * 24 * 60 * 60 },
  );

  return new Response('queued', { status: 202 });
};
