export interface BaseProduct {
  slug: string;
  title: string;
  hook: string;
  descriptor: string;
  priceCents: number;
  currency: 'GBP';
  category: 'journals' | 'apparel' | 'accessories' | 'digital';
  productType: 'journal' | 'apparel' | 'accessory' | 'digital';
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

export type Product = JournalProduct | ApparelProduct | AccessoryProduct | DigitalProduct;

import productsData from '../data/products.json';
export const allProducts = productsData as Product[];

export function findProductBySlug(slug: string, category?: string): Product | undefined {
  return allProducts.find(p =>
    p.slug === slug && (category ? p.category === category : true)
  );
}
