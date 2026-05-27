/**
 * Pure extraction utilities for product data.
 * Inputs: raw Printify titles + descriptions (Etsy-stuffed, supplier-named, mixed case).
 * Outputs: clean per-product fields ready to write to products.json.
 */

/**
 * Pull the brand-voice hook from an Etsy pipe-stuffed title.
 * Format: "Descriptor | hook line | gift keyword"
 * Returns the middle segment, cleaned, lowercased.
 */
export function extractHook(title) {
  if (!title) return '';
  const segments = title.split('|').map((s) => s.trim());
  const middle = segments.length >= 2 ? segments[1] : segments[0];
  // Strip trailing " all..." or any " word..." that got truncated mid-phrase
  return middle.replace(/\s+\S+\.\.\.\s*$/, '').toLowerCase();
}

const DESCRIPTORS = {
  'hardback-journal-a5': 'hardback journal · A5 · 96 blank pages',
  'softback-journal-a5': 'softback journal · A5 · 128 blank pages',
  'enamel-mug-11oz': 'enamel mug · 11oz',
  'embroidered-cap': 'embroidered cap · one size',
  'hoodie-unisex': 'unisex hoodie · cotton blend',
};

/**
 * Build the customer-facing descriptor subtitle from a product_type slug.
 * Falls back to humanised hyphenated string for unknown types.
 */
export function extractDescriptor(productType) {
  if (!productType) return '';
  if (DESCRIPTORS[productType]) return DESCRIPTORS[productType];
  return productType.replace(/-/g, ' ');
}

// Order matters: more specific (multi-word) patterns first so they consume
// before the standalone fallbacks fire. Each uses `(?:^|\s+)` so sentence-leading
// occurrences ("Printify ships..." at start of line/string) get matched too.
// Note: we deliberately keep "Made-to-order" / "Printed and shipped" intact —
// those are customer-facing phrases; we only strip the supplier-name half.
const SUPPLIER_PATTERNS = [
  /(?:^|\s+)via\s+printify\b/gi,
  /(?:^|\s+)by\s+prodigi(?:\s+uk)?(?:\s+on behalf of\s+oddlywiredco)?/gi,
  /(?:^|\s+)on behalf of\s+oddlywiredco\b/gi,
  /(?:^|\s+)sold\s+by\s+oddlywiredco\b/gi,
  /(?:^|\s+)prodigi(?:\s+uk)?\b/gi,
  /(?:^|\s+)printify\b/gi,
  /\s*\(sole proprietor\)\s*/gi,
];

/**
 * Strip all supplier/vendor name leaks from customer-facing copy.
 * Idempotent: returns the input unchanged if no patterns match.
 */
export function stripSupplierNames(text) {
  if (!text) return '';
  let out = text;
  for (const pat of SUPPLIER_PATTERNS) {
    out = out.replace(pat, '');
  }
  return out.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}
