import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import products from '../../data/products.json';

const ALLOWED_COUNTRIES = [
  'GB', 'IE',
  'US', 'CA',
  'AU', 'NZ',
  'DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'PT', 'SE', 'DK', 'NO', 'FI', 'AT', 'PL',
];

export const POST: APIRoute = async ({ request }) => {
  const STRIPE_SECRET_KEY = (env as any).STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return json({ error: 'stripe not configured' }, 503);
  }

  let body: { price_id?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { price_id, slug } = body;
  if (!price_id || !slug) {
    return json({ error: 'missing price_id or slug' }, 400);
  }

  const product = (products as any[]).find((p) => p.slug === slug && p.stripePriceId === price_id);
  if (!product) {
    return json({ error: 'product not found' }, 404);
  }

  const origin = new URL(request.url).origin;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('line_items[0][price]', product.stripePriceId);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${origin}/${product.category}/${product.slug}`);
  form.set('billing_address_collection', 'auto');
  ALLOWED_COUNTRIES.forEach((c, i) => {
    form.set(`shipping_address_collection[allowed_countries][${i}]`, c);
  });
  form.set('payment_method_types[0]', 'card');
  // Metadata duplicated on the session so the webhook has full context without a second lookup
  // Note: metadata keys stay snake_case because the webhook reads them as Stripe payload — don't change.
  form.set('metadata[slug]', product.slug);
  form.set('metadata[printify_shop_id]', String(product.printifyShopId));
  form.set('metadata[printify_product_id]', product.printifyProductId);
  form.set('metadata[printify_variant_id]', String(product.printifyVariantId));

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('stripe checkout session creation failed', res.status, errText);
    return json({ error: 'stripe checkout failed' }, 502);
  }

  const session = await res.json() as { url?: string; id?: string };
  if (!session.url) {
    return json({ error: 'no checkout url' }, 502);
  }

  return json({ url: session.url, session_id: session.id }, 200);
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
