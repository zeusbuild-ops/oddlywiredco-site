/**
 * Client-side basket. localStorage-backed, simple line-item array.
 *
 * Shape stored under `owc-cart`:
 *   { items: [{ slug, variantId?, quantity, addedAt }] }
 *
 * Variant ID is the Printify variant ID for apparel SKUs (selected via
 * size selector). Tote / journal / digital products have a single variant
 * and omit variantId (the checkout API falls back to product.printifyVariantId).
 */

export type CartItem = {
  slug: string;
  variantId?: string;
  quantity: number;
  addedAt: number; // epoch ms
};

type Cart = { items: CartItem[] };

const KEY = 'owc-cart';
const MAX_ITEMS = 20;
const MAX_QTY_PER_LINE = 10;

function read(): Cart {
  if (typeof window === 'undefined' || !window.localStorage) return { items: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

function write(cart: Cart): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cart));
  } catch (e) {
    console.error('cart write failed', e);
  }
}

export function getCart(): Cart {
  return read();
}

export function addToCart(item: { slug: string; variantId?: string; quantity?: number }): Cart {
  const cart = read();
  const qty = Math.max(1, Math.min(MAX_QTY_PER_LINE, Math.floor(item.quantity || 1)));
  // Merge by slug + variantId
  const existing = cart.items.find(
    (i) => i.slug === item.slug && (i.variantId || '') === (item.variantId || ''),
  );
  if (existing) {
    existing.quantity = Math.min(MAX_QTY_PER_LINE, existing.quantity + qty);
  } else {
    if (cart.items.length >= MAX_ITEMS) {
      throw new Error('basket full');
    }
    cart.items.push({
      slug: item.slug,
      variantId: item.variantId,
      quantity: qty,
      addedAt: Date.now(),
    });
  }
  write(cart);
  return cart;
}

export function updateQuantity(slug: string, variantId: string | undefined, quantity: number): Cart {
  const cart = read();
  const idx = cart.items.findIndex(
    (i) => i.slug === slug && (i.variantId || '') === (variantId || ''),
  );
  if (idx < 0) return cart;
  if (quantity <= 0) {
    cart.items.splice(idx, 1);
  } else {
    cart.items[idx].quantity = Math.min(MAX_QTY_PER_LINE, Math.floor(quantity));
  }
  write(cart);
  return cart;
}

export function removeFromCart(slug: string, variantId: string | undefined): Cart {
  return updateQuantity(slug, variantId, 0);
}

export function clearCart(): Cart {
  const empty: Cart = { items: [] };
  write(empty);
  return empty;
}

export function cartCount(): number {
  return read().items.reduce((sum, i) => sum + i.quantity, 0);
}

export function refreshCartBadge(): void {
  const count = cartCount();
  document.querySelectorAll('[data-cart-badge]').forEach((el) => {
    if (count > 0) {
      el.textContent = String(count);
      (el as HTMLElement).style.display = '';
    } else {
      el.textContent = '';
      (el as HTMLElement).style.display = 'none';
    }
  });
}

/** Checkout payload shape expected by /api/checkout basket flow. */
export function toCheckoutPayload(): { items: Array<{ slug: string; variant_id?: string; quantity: number }> } {
  const cart = read();
  return {
    items: cart.items.map((i) => ({
      slug: i.slug,
      variant_id: i.variantId,
      quantity: i.quantity,
    })),
  };
}
