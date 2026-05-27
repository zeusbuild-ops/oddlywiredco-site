import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHook } from './extract.mjs';

test('extractHook returns middle pipe segment, cleaned', () => {
  const title = 'ADHD Tabs Open Journal | 47 tabs. all important. all... | AuDHD Notebook Gift';
  assert.equal(extractHook(title), '47 tabs. all important.');
});

test('extractHook falls back to first segment if no middle', () => {
  assert.equal(extractHook('Single Title No Pipes'), 'single title no pipes');
});

test('extractHook trims trailing ellipsis-words', () => {
  assert.equal(extractHook('A | the chaos is a feature all... | B'), 'the chaos is a feature');
});

test('extractHook lowercases the output', () => {
  assert.equal(extractHook('A | LOUD HOOK LINE | B'), 'loud hook line');
});

test('extractHook handles empty title', () => {
  assert.equal(extractHook(''), '');
});

import { extractDescriptor, stripSupplierNames } from './extract.mjs';

test('extractDescriptor produces journal descriptor for hardback-journal-a5', () => {
  assert.equal(
    extractDescriptor('hardback-journal-a5'),
    'hardback journal · A5 · 96 blank pages'
  );
});

test('extractDescriptor falls back to humanised product_type for unknown types', () => {
  assert.equal(extractDescriptor('embroidered-cap-snapback'), 'embroidered cap snapback');
});

test('extractDescriptor handles missing input', () => {
  assert.equal(extractDescriptor(''), '');
});

test('stripSupplierNames removes Printify mentions', () => {
  const input = 'Made-to-order via Printify in the UK';
  assert.equal(stripSupplierNames(input), 'Made-to-order in the UK');
});

test('stripSupplierNames removes Prodigi mentions', () => {
  const input = 'Printed and shipped by Prodigi UK on behalf of OddlyWiredCo';
  assert.equal(stripSupplierNames(input), 'Printed and shipped');
});

test('stripSupplierNames is idempotent on clean input', () => {
  const clean = 'UK printed, made to order';
  assert.equal(stripSupplierNames(clean), clean);
});

test('stripSupplierNames is idempotent on matched input (run twice = same output)', () => {
  const dirty = 'Made-to-order via Printify in the UK';
  const once = stripSupplierNames(dirty);
  const twice = stripSupplierNames(once);
  assert.equal(twice, once);
});

test('stripSupplierNames removes sentence-leading Printify', () => {
  assert.equal(
    stripSupplierNames('Printify ships this to you in 3 days.'),
    'ships this to you in 3 days.'
  );
});

test('stripSupplierNames removes sentence-leading Prodigi', () => {
  assert.equal(
    stripSupplierNames('Prodigi UK handles fulfilment for us.'),
    'handles fulfilment for us.'
  );
});

test('stripSupplierNames removes "Sold by OddlyWiredCo" supplier-of-record leak', () => {
  assert.equal(
    stripSupplierNames('Sold by OddlyWiredCo (sole proprietor).'),
    '.'
  );
});

test('stripSupplierNames handles punctuation-adjacent Printify', () => {
  assert.equal(
    stripSupplierNames('Fast shipping via Printify, our UK supplier.'),
    'Fast shipping, our UK supplier.'
  );
});
