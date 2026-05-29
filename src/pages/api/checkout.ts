import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import products from '../../data/products.json';

const ALLOWED_COUNTRIES = [
  'GB', 'IE',
  'US', 'CA',
  'AU', 'NZ',
  'DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'PT', 'SE', 'DK', 'NO', 'FI', 'AT', 'PL',
];

type CheckoutItem = { slug: string; variant_id?: string | number; quantity?: number };
type SingleBody = { price_id: string; slug: string; variant_id?: string | number };
type BasketBody = { items: CheckoutItem[] };

export const POST: APIRoute = async ({ request }) => {
  const STRIPE_SECRET_KEY = (env as any).STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return json({ error: 'stripe not configured' }, 503);
  }

  let body: SingleBody | BasketBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  // Multi-item basket flow
  if ('items' in body && Array.isArray(body.items)) {
    return basketCheckout(STRIPE_SECRET_KEY, body.items, request);
  }

  // Single-item flow (buy now, with optional variant_id from size selector)
  return singleCheckout(STRIPE_SECRET_KEY, body as SingleBody, request);
};

async function singleCheckout(
  key: string,
  body: SingleBody,
  request: Request,
): Promise<Response> {
  const { price_id, slug, variant_id } = body;
  if (!price_id || !slug) {
    return json({ error: 'missing price_id or slug' }, 400);
  }
  const product = (products as any[]).find((p) => p.slug === slug && p.stripePriceId === price_id);
  if (!product) {
    return json({ error: 'product not found' }, 404);
  }

  const resolvedVariantId = resolveVariantId(product, variant_id);
  if (!resolvedVariantId) {
    return json({ error: 'invalid variant_id for product' }, 400);
  }
  // Per-variant price (2XL upcharge etc) falls back to product default
  const lineItemPriceId = resolvePriceId(product, variant_id) || product.stripePriceId;

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('line_items[0][price]', lineItemPriceId);
  form.set('line_items[0][quantity]', '1');
  setSessionCommon(form, origin, product.category, product.slug);

  // Single-item metadata (kept for back-compat with existing webhook path)
  form.set('metadata[slug]', product.slug);
  form.set('metadata[printify_shop_id]', String(product.printifyShopId));
  form.set('metadata[printify_product_id]', product.printifyProductId);
  form.set('metadata[printify_variant_id]', String(resolvedVariantId));

  return createStripeSession(key, form);
}

async function basketCheckout(
  key: string,
  items: CheckoutItem[],
  request: Request,
): Promise<Response> {
  if (items.length === 0) {
    return json({ error: 'basket is empty' }, 400);
  }
  if (items.length > 20) {
    return json({ error: 'basket too large (max 20 line items)' }, 400);
  }

  // Resolve every item: product lookup + variant validation + price selection
  const resolved: Array<{ product: any; variantId: number; quantity: number; priceId: string }> = [];
  for (const it of items) {
    const product = (products as any[]).find((p) => p.slug === it.slug);
    if (!product) return json({ error: `unknown slug: ${it.slug}` }, 400);
    const variantId = resolveVariantId(product, it.variant_id);
    if (!variantId) return json({ error: `invalid variant_id for ${it.slug}` }, 400);
    const priceId = resolvePriceId(product, it.variant_id) || product.stripePriceId;
    const quantity = Math.max(1, Math.min(10, Math.floor(Number(it.quantity) || 1)));
    resolved.push({ product, variantId, quantity, priceId });
  }

  // All items must be on the same Printify shop (true today — everything is shop 27681461)
  const shopIds = Array.from(new Set(resolved.map((r) => String(r.product.printifyShopId))));
  if (shopIds.length > 1) {
    return json({ error: 'mixed printify shops not supported' }, 400);
  }
  const shopId = shopIds[0];

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  resolved.forEach((r, i) => {
    form.set(`line_items[${i}][price]`, r.priceId);
    form.set(`line_items[${i}][quantity]`, String(r.quantity));
  });
  // For multi-item return-to-cart on cancel
  setSessionCommon(form, origin, 'cart', '');

  // Pack the basket into a single JSON metadata blob the webhook can deserialize.
  // Stripe metadata value cap is 500 chars; 20 items × ~60 chars each = ~1200 chars worst case,
  // so we split if needed.
  const basketJson = JSON.stringify(
    resolved.map((r) => ({
      slug: r.product.slug,
      pp: r.product.printifyProductId,
      pv: r.variantId,
      q: r.quantity,
    })),
  );
  // Single value or chunked
  const chunks = chunkString(basketJson, 480);
  if (chunks.length === 1) {
    form.set('metadata[basket_json]', chunks[0]);
  } else {
    form.set('metadata[basket_chunks]', String(chunks.length));
    chunks.forEach((c, i) => form.set(`metadata[basket_json_${i}]`, c));
  }
  form.set('metadata[printify_shop_id]', shopId);
  form.set('metadata[basket_size]', String(resolved.length));

  return createStripeSession(key, form);
}

function setSessionCommon(form: URLSearchParams, origin: string, category: string, slug: string): void {
  form.set('success_url', `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  // For single-item cancel, return to product page. For basket cancel, return to cart page.
  const cancelPath = category === 'cart' ? '/cart' : `/${category}/${slug}`;
  form.set('cancel_url', `${origin}${cancelPath}`);
  form.set('billing_address_collection', 'auto');
  ALLOWED_COUNTRIES.forEach((c, i) => {
    form.set(`shipping_address_collection[allowed_countries][${i}]`, c);
  });
  form.set('payment_method_types[0]', 'card');
  addShippingOptions(form);
}

/** Shipping_options on the Checkout Session. Customer picks one based on
 *  their address. UK = free (already baked into retail), International = +£7
 *  to cover the higher cost of shipping from T Shirt and Sons UK to US/EU/AU.
 *  Honor-system — Stripe doesn't filter shipping_options by destination so
 *  a US customer could in theory pick UK Free. Most won't. Tune the rates
 *  here if margin reality shifts.
 */
function addShippingOptions(form: URLSearchParams): void {
  // Option 0: UK Royal Mail Tracked, free
  form.set('shipping_options[0][shipping_rate_data][display_name]', 'UK Royal Mail Tracked');
  form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'gbp');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', '2');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', '4');

  // Option 1: International Tracked, +£7
  form.set('shipping_options[1][shipping_rate_data][display_name]', 'International Tracked');
  form.set('shipping_options[1][shipping_rate_data][type]', 'fixed_amount');
  form.set('shipping_options[1][shipping_rate_data][fixed_amount][amount]', '700');
  form.set('shipping_options[1][shipping_rate_data][fixed_amount][currency]', 'gbp');
  form.set('shipping_options[1][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
  form.set('shipping_options[1][shipping_rate_data][delivery_estimate][minimum][value]', '5');
  form.set('shipping_options[1][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
  form.set('shipping_options[1][shipping_rate_data][delivery_estimate][maximum][value]', '10');
}

function resolveVariantId(product: any, requested: string | number | undefined): number | null {
  // If size selector provided a variant_id, validate it's one of this product's sizes.
  if (requested !== undefined && requested !== null && requested !== '') {
    const requestedNum = Number(requested);
    if (!Number.isFinite(requestedNum)) return null;
    if (Array.isArray(product.sizes)) {
      const match = product.sizes.find((s: any) => Number(s.sku) === requestedNum);
      if (!match) return null;
      if (match.stockState === 'sold-out') return null;
    }
    return requestedNum;
  }
  // Fall back to product default
  return Number(product.printifyVariantId);
}

function resolvePriceId(product: any, requested: string | number | undefined): string | null {
  // For per-variant pricing (2XL upcharge). Returns the variant's own
  // stripePriceId if set, else null (caller falls back to product default).
  if (requested === undefined || requested === null || requested === '') return null;
  if (!Array.isArray(product.sizes)) return null;
  const requestedNum = Number(requested);
  const match = product.sizes.find((s: any) => Number(s.sku) === requestedNum);
  return match?.stripePriceId || null;
}

function chunkString(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

async function createStripeSession(key: string, form: URLSearchParams): Promise<Response> {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
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
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
