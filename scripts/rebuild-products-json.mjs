#!/usr/bin/env node
/**
 * Rebuild src/data/products.json from the sibling OddlyWiredCo project's
 * Printify + Stripe build artifacts.
 *
 * Usage:    node scripts/rebuild-products-json.mjs
 * Env:      OWC_BUILD_DIR  Default: ../OddlyWiredCo/build  (root, not a worktree)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractHook, extractDescriptor, extractWhy,
  extractKeypoints, extractWhatsInside, extractFAQ,
  stripSupplierNames, resolveCategory, pickCrossSell,
} from './lib/extract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const BUILD_DIR = process.env.OWC_BUILD_DIR
  ?? resolve(SITE_ROOT, '..', 'OddlyWiredCo/build');

// Maps Printify-blueprint format to coarse product type.
// Add entries here when new product formats land (e.g. tshirt-unisex → apparel).
const PRODUCT_FORMAT_TO_TYPE = {
  'hardback-journal-a5': 'journal',
  // future formats:
  // 'softback-journal-a5': 'journal',
  // 'mug-11oz':           'accessory',
  // 'tshirt-unisex':      'apparel',
};

// Type-specific defaults applied when the upstream mapping has no per-product
// source for these fields. Keyed by productFormat.
const FORMAT_DEFAULTS = {
  'hardback-journal-a5': {
    blankPages: 96,
    trimSize: '5.2" × 7.4" (13 × 19 cm)',
    binding: 'hardback',
  },
};

console.log(`reading build artifacts from: ${BUILD_DIR}`);
if (!existsSync(BUILD_DIR)) {
  console.error(`ERROR: build dir not found. Set OWC_BUILD_DIR or check path.`);
  process.exit(1);
}

const mapping = JSON.parse(
  readFileSync(resolve(BUILD_DIR, 'phase-3-stripe/stripe-products-mapping.json'), 'utf8')
);

// First pass: build each product with extracted fields + category
// Optional: image URL rewrite map produced by mirror-printify-images-to-r2.py.
// Maps Printify CDN URLs to media.oddlywiredco.com R2 URLs so the rendered site
// never serves customers an images-api.printify.com URL.
const mirrorFile = resolve(SITE_ROOT, 'src/data/image-mirror.json');
const imageMirror = existsSync(mirrorFile) ? JSON.parse(readFileSync(mirrorFile, 'utf8')) : {};
if (Object.keys(imageMirror).length === 0) {
  console.warn('NOTE: src/data/image-mirror.json missing or empty — image URLs will fall back to Printify CDN. Run scripts/mirror-printify-images-to-r2.py first.');
} else {
  console.log(`using image mirror with ${Object.keys(imageMirror).length} URL rewrites`);
}

const rewriteImageUrl = (src) => imageMirror[src] ?? src;

const products = mapping.map((p) => {
  const cloneFile = resolve(BUILD_DIR, `phase-2-mirror/clone-${p.printify_etsy_product_id}.json`);
  if (!existsSync(cloneFile)) {
    console.warn(`MISSING clone for ${p.slug} (${p.printify_etsy_product_id}) — using mapping-only`);
  }
  const clone = existsSync(cloneFile) ? JSON.parse(readFileSync(cloneFile, 'utf8')) : {};
  const description = clone.description ?? '';

  const images = (clone.images ?? []).map((i) => rewriteImageUrl(i.src));
  const heroImage = images.find((src) => src) ?? '';
  const gallery = images.slice(0, 4);

  const category = resolveCategory(p.slug, p.product_type);
  const whatsInside = extractWhatsInside(description);
  // Gate the journal-specific gift cue: only journals get the "no outer branding" lines.
  // For other categories, drop those two lines (extractWhatsInside appended them based on /gift-ready/ text).
  const whatsInsideFiltered = category === 'journals'
    ? whatsInside
    : whatsInside.filter((b) =>
        !/no outer branding on the journal/.test(b) &&
        !/lands looking like a journal/.test(b)
      );

  const productFormat = p.product_type;
  const productType = PRODUCT_FORMAT_TO_TYPE[productFormat];
  if (!productType) {
    throw new Error(`unknown productFormat "${productFormat}" for slug "${p.slug}" — add it to PRODUCT_FORMAT_TO_TYPE`);
  }
  const formatDefaults = FORMAT_DEFAULTS[productFormat] ?? {};

  return {
    slug: p.slug,
    title: p.title,
    hook: extractHook(p.title),
    descriptor: extractDescriptor(productFormat),
    priceCents: p.price_cents,
    currency: 'GBP',
    category,
    productType,
    productFormat,
    ...formatDefaults,
    heroImage,
    gallery,
    whyParagraph: extractWhy(description),
    keypoints: extractKeypoints(description),
    whatsInside: whatsInsideFiltered,
    faq: extractFAQ(description),
    tags: p.tags ?? [],
    stripePriceId: p.stripe_price_id,
    stripeProductId: p.stripe_product_id,
    // Server-only fulfilment IDs (used by webhook, never sent to client)
    printifyShopId: p.printify_site_shop_id,
    printifyProductId: p.printify_site_product_id,
    printifyVariantId: p.variant_id,
    printifyBlueprintId: p.blueprint_id,
    printifyProviderId: p.print_provider_id,
  };
});

// Second pass: cross-sell slugs (needs the full product list)
for (const p of products) {
  p.crossSellSlugs = pickCrossSell(p.slug, products);
}

const outPath = resolve(SITE_ROOT, 'src/data/products.json');
writeFileSync(outPath, JSON.stringify(products, null, 2));
console.log(`wrote ${products.length} products → ${outPath}`);

// Sanity check
const sample = products[0];
console.log('\nfirst product sample:');
console.log(`  slug:        ${sample.slug}`);
console.log(`  hook:        ${sample.hook}`);
console.log(`  descriptor:  ${sample.descriptor}`);
console.log(`  category:    ${sample.category}`);
console.log(`  keypoints:   ${sample.keypoints.length} bullets`);
console.log(`  faq:         ${sample.faq.length} Q&As`);
console.log(`  crossSell:   ${sample.crossSellSlugs.join(', ')}`);
console.log(`  whyPara:     ${sample.whyParagraph.slice(0, 80)}...`);
