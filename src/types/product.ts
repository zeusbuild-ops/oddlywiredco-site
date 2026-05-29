export interface BaseProduct {
  slug: string;
  title: string;
  hook: string;
  descriptor: string;
  priceCents: number;
  currency: 'GBP';
  category: 'journals' | 'apparel' | 'accessories' | 'digital' | 'mug';
  productType: 'journal' | 'apparel' | 'accessory' | 'digital' | 'mug';
  productFormat: string;
  heroImage: string;
  gallery: string[];
  whyParagraph: string;
  keypoints: string[];
  faq: { question: string; answer: string }[];
  tags: string[];
  crossSellSlugs: string[];
  stripePriceId: string;
  stripeProductId: string;
  printifyShopId: number;
  printifyProductId: string;
  printifyVariantId: number;
  printifyBlueprintId: number;
  printifyProviderId: number;
  featured?: boolean;
}

export interface JournalProduct extends BaseProduct {
  productType: 'journal';
  whatsInside: string[];
  blankPages: number;
  trimSize: string;
  binding: 'hardback' | 'softback' | 'spiral';
}

export interface ApparelSize {
  name: string;
  sku: string;
  stockState: 'in-stock' | 'low-stock' | 'sold-out';
  /** Optional per-variant pricing (for 2XL upcharge). Falls back to
   *  product.priceCents / product.stripePriceId when absent. */
  priceCents?: number;
  stripePriceId?: string;
}

export interface ApparelProduct extends BaseProduct {
  productType: 'apparel';
  sizes: ApparelSize[];
  material: string;
  fitNote: string;
}

export interface AccessoryProduct extends BaseProduct {
  productType: 'accessory';
  capacity: string;
  material: string;
  careNotes: string[];
}

export interface DigitalProduct extends BaseProduct {
  productType: 'digital';
  fileTypes: string[];
  pageCount?: number;
  printable: boolean;
  fillable: boolean;
  instantDelivery: boolean;
}

export interface MugProduct extends BaseProduct {
  productType: 'mug';
  category: 'mug';
  whatsInside: string[];
}

export type Product = JournalProduct | ApparelProduct | AccessoryProduct | DigitalProduct | MugProduct;

import productsData from '../data/products.json';

// Featured slugs are the source of truth for the homepage "doom pile" + Featured-3
// section. They live here in code (not products.json) because the rebuild script
// regenerates products.json from Printify/Stripe artifacts and would wipe any
// hand-edited `featured: true` flags. Edit this set to change what's featured.
const FEATURED_SLUGS = new Set<string>([
  // Apparel — highest margin, leads on mobile
  'oddly-hoodie-late-diagnosed-club',
  'oddly-hoodie-overstimulated',
  'oddly-tee-hyperfocus',
  'oddly-tee-pov-3am',
  // Mugs — new format, pairs visually with the featured hoodie/tee hooks
  'oddly-mug-overstimulated',
  'oddly-mug-hyperfocusing',
  // Accessory — brand-iconic doom-pile hook
  'oddly-tote-doom-pile',
  // Journal — the iconic one
  '47-tabs-all-journal',
]);

const CATEGORY_ORDER: Record<Product['productType'], number> = {
  apparel: 0, mug: 1, accessory: 2, journal: 3, digital: 4,
};

const _raw = productsData as Product[];
export const allProducts: Product[] = _raw.map(p => ({
  ...p,
  featured: FEATURED_SLUGS.has(p.slug),
}));

// Featured products, sorted by category priority then price desc.
// Used by DoomPileFold and the homepage Featured-3.
export const featuredProducts: Product[] = allProducts
  .filter(p => p.featured)
  .sort((a, b) => {
    const c = CATEGORY_ORDER[a.productType] - CATEGORY_ORDER[b.productType];
    return c !== 0 ? c : b.priceCents - a.priceCents;
  });

export function findProductBySlug(slug: string, category?: string): Product | undefined {
  return allProducts.find(p =>
    p.slug === slug && (category ? p.category === category : true)
  );
}
