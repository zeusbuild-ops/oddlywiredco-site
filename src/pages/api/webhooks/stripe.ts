import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const TOLERANCE_SECONDS = 300; // Stripe default — reject events older than 5 min

export const POST: APIRoute = async ({ request }) => {
  const WEBHOOK_SECRET = (env as any).STRIPE_WEBHOOK_SECRET;
  const PRINTIFY_TOKEN = (env as any).PRINTIFY_TOKEN;

  if (!WEBHOOK_SECRET || !PRINTIFY_TOKEN) {
    console.error('webhook misconfigured: missing STRIPE_WEBHOOK_SECRET or PRINTIFY_TOKEN');
    return new Response('misconfigured', { status: 503 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });

  const rawBody = await request.text();

  const verified = await verifyStripeSignature(rawBody, sig, WEBHOOK_SECRET);
  if (!verified) {
    console.error('webhook signature verification failed');
    return new Response('bad signature', { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 });
  }

  const session = event.data?.object;
  if (!session) return new Response('no session', { status: 400 });

  const metadata = session.metadata || {};
  const slug = metadata.slug;
  const shop_id = metadata.printify_shop_id;
  const product_id = metadata.printify_product_id;
  const variant_id = parseInt(metadata.printify_variant_id, 10);

  if (!slug || !shop_id || !product_id || !variant_id) {
    console.error('webhook session missing required metadata', metadata);
    return new Response('incomplete metadata', { status: 400 });
  }

  const shipping = session.shipping_details;
  const customer = session.customer_details;
  if (!shipping?.address || !customer?.email) {
    console.error('webhook session missing shipping/customer details');
    return new Response('missing shipping or email', { status: 400 });
  }

  const [first_name, ...rest] = String(shipping.name || customer.name || '').trim().split(/\s+/);
  const last_name = rest.join(' ') || first_name || 'Customer';

  const order = {
    external_id: session.id,
    label: `OWC-${slug}-${String(session.id).slice(-8)}`,
    line_items: [
      {
        product_id,
        variant_id,
        quantity: 1,
      },
    ],
    shipping_method: 1,
    send_shipping_notification: false,
    address_to: {
      first_name: first_name || 'Customer',
      last_name,
      email: customer.email,
      phone: customer.phone || '',
      country: shipping.address.country,
      region: shipping.address.state || '',
      address1: shipping.address.line1,
      address2: shipping.address.line2 || '',
      city: shipping.address.city,
      zip: shipping.address.postal_code,
    },
  };

  const orderRes = await fetch(`https://api.printify.com/v1/shops/${shop_id}/orders.json`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PRINTIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(order),
  });

  if (!orderRes.ok) {
    const errText = await orderRes.text();
    console.error('printify order creation failed', orderRes.status, errText, 'session:', session.id);
    return new Response('printify failed', { status: 502 });
  }

  const orderJson = await orderRes.json() as { id?: string };
  console.log('printify order created', orderJson.id, 'for session', session.id);
  return new Response(JSON.stringify({ received: true, printify_order_id: orderJson.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return constantTimeEqual(expected, v1);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
