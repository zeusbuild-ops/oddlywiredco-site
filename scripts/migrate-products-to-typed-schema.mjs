import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, '../src/data/products.json');
const products = JSON.parse(readFileSync(path, 'utf-8'));

const JOURNAL_DEFAULTS = {
  blankPages: 96,
  trimSize: '5.2" × 7.4" (13 × 19 cm)',
  binding: 'hardback',
};

const migrated = products.map(p => {
  // Sanity: all current products must be journals (per category)
  if (p.category !== 'journals') {
    throw new Error(`unexpected non-journal product during migration: ${p.slug}`);
  }
  // Fix pre-existing data bug
  const existingFormat = (p.slug === 'you-can-be-journal' && p.productType === 'mug-11oz')
    ? 'hardback-journal-a5'
    : p.productType;
  // Build new shape: rename productType -> productFormat, set coarse productType
  const { productType: _drop, ...rest } = p;
  return {
    ...JOURNAL_DEFAULTS,
    ...rest,
    productType: 'journal',           // new coarse business category
    productFormat: existingFormat,    // renamed fine-grained variant
    whatsInside: p.whatsInside || [],
  };
});

writeFileSync(path, JSON.stringify(migrated, null, 2) + '\n');
console.log(`migrated ${migrated.length} products to typed schema (renamed productType->productFormat, added coarse productType, fixed 1 mistyped product)`);
