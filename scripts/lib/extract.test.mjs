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

test('stripSupplierNames "shipped from Prodigi UK" leaves no orphan "from"', () => {
  assert.equal(
    stripSupplierNames('Printed and shipped from Prodigi UK. Royal Mail in the UK, DHL/USPS elsewhere.'),
    'Printed and shipped. Royal Mail in the UK, DHL/USPS elsewhere.'
  );
});

test('stripSupplierNames "printed and hardbound by Prodigi UK on behalf of OddlyWiredCo" → "Printed and hardbound"', () => {
  assert.equal(
    stripSupplierNames('Printed and hardbound by Prodigi UK on behalf of OddlyWiredCo'),
    'Printed and hardbound'
  );
});

import { extractWhy, extractKeypoints, extractWhatsInside, extractFAQ } from './extract.mjs';

const SAMPLE_DESCRIPTION = `you're in the right corner. of the internet. A hardback journal for ADHD brains who think differently.

WHAT'S INSIDE
• Hardback journal, 5.2" × 7.4" (≈ 13 × 19 cm)
• 96 blank pages (use it however your brain wants — no lines, no rules, no judgement)
• Wraparound printed cover in brand v2 chrome
• Printed and hardbound by Prodigi UK on behalf of OddlyWiredCo

THE WHY
This journal lives in the tabs open corner of the OddlyWiredCo lineup. The cover says what your brain has been trying to say. The blank pages are for everything underneath.

FAQ
Is this lined or blank?
Blank. Lines feel like another rule to break. Bring your own.
Where does it ship from?
Printed and shipped from Prodigi UK. Royal Mail in the UK, DHL/USPS/locals everywhere else.
Is it gift-ready?
The cover speaks for itself.

—
Cover artwork is produced using AI-assisted design tools and finalised by the maker.
Printed and shipped by Prodigi UK on behalf of OddlyWiredCo (sole proprietor).`;

test('extractWhy returns the THE WHY paragraph, lowercased, supplier-stripped', () => {
  const result = extractWhy(SAMPLE_DESCRIPTION);
  assert.match(result, /this journal lives in the tabs open corner/);
  assert.match(result, /the blank pages are for everything underneath\.?$/);
  assert.doesNotMatch(result, /prodigi/i);
});

test('extractWhy returns fallback if THE WHY section missing', () => {
  assert.equal(extractWhy('no sections here at all'), 'made for the brain that wired this way.');
});

test('extractKeypoints returns up to first 4 real WHAT\'S INSIDE bullets', () => {
  // SAMPLE has 4 raw bullets; bullet 4 is supplier-only ("Printed and hardbound
  // by Prodigi UK...") which becomes orphan after stripping and is dropped.
  const result = extractKeypoints(SAMPLE_DESCRIPTION);
  assert.equal(result.length, 3);
  assert.match(result[0], /hardback journal/i);
  assert.match(result[1], /96 blank pages/i);
  assert.match(result[2], /wraparound printed cover/i);
});

test('extractKeypoints lowercases first letter of each bullet for brand voice', () => {
  const result = extractKeypoints(SAMPLE_DESCRIPTION);
  for (const kp of result) {
    assert.equal(kp.charAt(0), kp.charAt(0).toLowerCase(), `bullet should start lowercase: ${kp}`);
  }
});

test('extractKeypoints strips supplier names from bullet text', () => {
  const result = extractKeypoints(SAMPLE_DESCRIPTION);
  for (const kp of result) {
    assert.doesNotMatch(kp, /prodigi/i, `keypoint should not mention Prodigi: ${kp}`);
    assert.doesNotMatch(kp, /printify/i, `keypoint should not mention Printify: ${kp}`);
  }
});

test('extractKeypoints drops orphan "printed and hardbound" stub (sample has it as bullet 4)', () => {
  const result = extractKeypoints(SAMPLE_DESCRIPTION);
  for (const kp of result) {
    assert.doesNotMatch(kp, /^printed and (?:shipped|hardbound)\.?\s*$/i, `orphan supplier stub leaked: "${kp}"`);
  }
  // After dropping the orphan, sample should have exactly 3 real keypoints
  assert.equal(result.length, 3, `expected 3 real keypoints after dropping orphan, got ${result.length}: ${JSON.stringify(result)}`);
});

test('extractWhatsInside returns all bullets', () => {
  const result = extractWhatsInside(SAMPLE_DESCRIPTION);
  assert.ok(result.length >= 3, `expected >= 3 bullets, got ${result.length}`);
});

test('extractFAQ returns array of {q, a} objects', () => {
  const result = extractFAQ(SAMPLE_DESCRIPTION);
  assert.equal(result.length, 3);
  assert.equal(result[0].q, 'Is this lined or blank?');
  assert.match(result[0].a, /Blank\. Lines feel like another rule/);
});

test('extractFAQ strips supplier names from answers', () => {
  const result = extractFAQ(SAMPLE_DESCRIPTION);
  for (const item of result) {
    assert.doesNotMatch(item.a, /prodigi/i, `FAQ answer should not mention Prodigi: ${item.a}`);
  }
});

test('extractFAQ returns empty array if no FAQ section', () => {
  assert.deepEqual(extractFAQ('no FAQ section'), []);
});

import { resolveCategory, pickCrossSell } from './extract.mjs';

test('resolveCategory returns "journals" for any -journal slug', () => {
  assert.equal(resolveCategory('47-tabs-all-journal', 'hardback-journal-a5'), 'journals');
  assert.equal(resolveCategory('chaos-feature-journal', 'softback-journal-a5'), 'journals');
});

test('resolveCategory routes apparel product types', () => {
  assert.equal(resolveCategory('any-slug', 'hoodie-unisex'), 'apparel');
  assert.equal(resolveCategory('any-slug', 'embroidered-cap'), 'apparel');
  assert.equal(resolveCategory('any-slug', 'tee-unisex'), 'apparel');
});

test('resolveCategory routes accessories', () => {
  assert.equal(resolveCategory('any-slug', 'enamel-mug-11oz'), 'accessories');
  assert.equal(resolveCategory('any-slug', 'tote-bag'), 'accessories');
  assert.equal(resolveCategory('any-slug', 'enamel-pin'), 'accessories');
});

test('resolveCategory routes digital', () => {
  assert.equal(resolveCategory('any-slug', 'pdf-printable'), 'digital');
  assert.equal(resolveCategory('any-slug', 'notion-template'), 'digital');
});

test('resolveCategory falls back to journals for unknown types', () => {
  assert.equal(resolveCategory('mystery', 'totally-new-thing'), 'journals');
});

test('pickCrossSell returns 4 deterministic same-category products', () => {
  const all = [
    { slug: 'a', category: 'journals' },
    { slug: 'b', category: 'journals' },
    { slug: 'c', category: 'journals' },
    { slug: 'd', category: 'journals' },
    { slug: 'e', category: 'journals' },
    { slug: 'f', category: 'apparel' },
  ];
  const result = pickCrossSell('a', all);
  assert.equal(result.length, 4);
  assert.ok(!result.includes('a'), 'should not cross-sell self');
  assert.ok(!result.includes('f'), 'should not cross-sell different category');
});

test('pickCrossSell is stable (same input → same output)', () => {
  const all = [
    { slug: 'a', category: 'journals' }, { slug: 'b', category: 'journals' },
    { slug: 'c', category: 'journals' }, { slug: 'd', category: 'journals' },
    { slug: 'e', category: 'journals' }, { slug: 'g', category: 'journals' },
  ];
  const a = pickCrossSell('a', all);
  const b = pickCrossSell('a', all);
  assert.deepEqual(a, b);
});

test('pickCrossSell tops up from other categories if same-category has < 4', () => {
  const all = [
    { slug: 'a', category: 'journals' },
    { slug: 'b', category: 'journals' },
    { slug: 'c', category: 'apparel' },
    { slug: 'd', category: 'apparel' },
    { slug: 'e', category: 'accessories' },
  ];
  const result = pickCrossSell('a', all);
  assert.equal(result.length, 4);
  assert.ok(result.includes('b'), 'should include other journal');
});
