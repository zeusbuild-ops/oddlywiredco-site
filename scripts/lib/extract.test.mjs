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

test('stripSupplierNames is idempotent', () => {
  const clean = 'UK printed, made to order';
  assert.equal(stripSupplierNames(clean), clean);
});
