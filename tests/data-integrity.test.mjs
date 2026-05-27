import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const products = JSON.parse(
  readFileSync(join(__dirname, '../src/data/products.json'), 'utf-8')
);

const VALID_PRODUCT_TYPES = ['journal', 'apparel', 'accessory', 'digital'];
const SUPPLIER_PATTERN = /prodigi|printify|printful|supplier/i;

test('every product has a valid productType', () => {
  for (const p of products) {
    assert.ok(
      VALID_PRODUCT_TYPES.includes(p.productType),
      `product ${p.slug} has invalid productType: ${p.productType}`
    );
  }
});

test('every product has a productFormat (Printify-blueprint-specific)', () => {
  for (const p of products) {
    assert.ok(
      typeof p.productFormat === 'string' && p.productFormat.length > 0,
      `product ${p.slug} missing productFormat`
    );
  }
});

test('no supplier names leak into visible copy', () => {
  for (const p of products) {
    const visible = [
      p.descriptor,
      p.whyParagraph,
      ...(p.keypoints || []),
      ...(p.whatsInside || []),
      ...(p.faq || []).map(f => f.answer),
    ].join(' \n ');
    assert.doesNotMatch(
      visible,
      SUPPLIER_PATTERN,
      `product ${p.slug} leaks a supplier name in visible copy`
    );
  }
});

test('journal products have required journal-specific fields', () => {
  const journals = products.filter(p => p.productType === 'journal');
  assert.ok(journals.length > 0, 'expected at least one journal product');
  for (const j of journals) {
    assert.ok(Array.isArray(j.whatsInside), `${j.slug} missing whatsInside[]`);
    assert.ok(typeof j.blankPages === 'number', `${j.slug} missing blankPages`);
    assert.ok(typeof j.trimSize === 'string', `${j.slug} missing trimSize`);
    assert.ok(
      ['hardback', 'softback', 'spiral'].includes(j.binding),
      `${j.slug} has invalid binding: ${j.binding}`
    );
  }
});
