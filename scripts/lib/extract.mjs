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
 * Build the customer-facing descriptor subtitle from a productFormat slug.
 * Falls back to humanised hyphenated string for unknown formats.
 */
export function extractDescriptor(productFormat) {
  if (!productFormat) return '';
  if (DESCRIPTORS[productFormat]) return DESCRIPTORS[productFormat];
  return productFormat.replace(/-/g, ' ');
}

// Order matters: more specific (multi-word) patterns first so they consume
// before the standalone fallbacks fire. Each uses `(?:^|\s+)` so sentence-leading
// occurrences ("Printify ships..." at start of line/string) get matched too.
// Note: we deliberately keep "Made-to-order" / "Printed and shipped" intact —
// those are customer-facing phrases; we only strip the supplier-name half.
// The "from Prodigi UK" pattern MUST come before the standalone "Prodigi"
// pattern, otherwise "shipped from Prodigi UK" leaves a malformed orphan "from".
const SUPPLIER_PATTERNS = [
  /(?:^|\s+)via\s+printify\b/gi,
  /(?:^|\s+)by\s+prodigi(?:\s+uk)?(?:\s+on behalf of\s+oddlywiredco)?/gi,
  /(?:^|\s+)from\s+prodigi(?:\s+uk)?\b/gi,
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

/**
 * Find a section by header (case-insensitive, allows whitespace + colons).
 * Returns the text between the header and the next blank line / next ALL CAPS line / "—".
 */
function findSection(text, header) {
  const headerPattern = new RegExp(`^\\s*${header}\\s*:?\\s*$`, 'im');
  const headerMatch = text.match(headerPattern);
  if (!headerMatch) return '';
  const start = headerMatch.index + headerMatch[0].length;
  const rest = text.slice(start);
  // Stop at next ALL CAPS section header (>= 3 chars), or "—" divider, or end of string
  const endMatch = rest.match(/\n\s*(?:[A-Z][A-Z\s']{2,}|—|---)\s*$|\n\s*[A-Z][A-Z\s']{2,}:?\s*\n/m);
  return endMatch ? rest.slice(0, endMatch.index).trim() : rest.trim();
}

/**
 * Get the brand-voice "why this exists" paragraph for a product.
 * Lowercased, supplier-stripped, single paragraph.
 */
export function extractWhy(description) {
  if (!description) return 'made for the brain that wired this way.';
  const section = findSection(description, 'THE WHY');
  if (!section) return 'made for the brain that wired this way.';
  return stripSupplierNames(section.toLowerCase());
}

function parseBullets(sectionText) {
  return sectionText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('•'))
    .map((l) => stripSupplierNames(l.replace(/^•\s*/, '')))
    .filter((l) => l.length > 0)
    // Drop orphan supplier stubs that, after stripping, are nothing but
    // "printed and shipped/hardbound" with no remaining content.
    .filter((l) => !/^printed and (?:shipped|hardbound)\.?\s*$/i.test(l))
    .map((l) => l.charAt(0).toLowerCase() + l.slice(1));
}

/**
 * Get the first 4 "WHAT'S INSIDE" bullets, for the hero fold.
 */
export function extractKeypoints(description) {
  if (!description) return [];
  const section = findSection(description, "WHAT'S INSIDE");
  return parseBullets(section).slice(0, 4);
}

/**
 * Get all "WHAT'S INSIDE" bullets, plus the gift-cue line, for fold 3.
 */
export function extractWhatsInside(description) {
  if (!description) return [];
  const section = findSection(description, "WHAT'S INSIDE");
  const bullets = parseBullets(section);
  // Add gift cue if FAQ mentions gift-ready
  if (/gift-ready/i.test(description)) {
    bullets.push('cover speaks for itself — no outer branding on the journal');
    bullets.push('lands looking like a journal, not a parcel from a brand');
  }
  return bullets;
}

/**
 * Parse the FAQ section into { question, answer } objects.
 * question is any line ending in "?", answer is the next non-blank non-question line(s).
 */
export function extractFAQ(description) {
  if (!description) return [];
  const section = findSection(description, 'FAQ');
  if (!section) return [];
  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith('?')) {
      const question = lines[i];
      const aParts = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].endsWith('?')) break;
        aParts.push(lines[j]);
        i = j;
      }
      const answer = stripSupplierNames(aParts.join(' '));
      if (answer) out.push({ question, answer });
    }
  }
  return out;
}

// Rules are tested in order; first match wins.
// Slug-based rules run before useType rules so journal slugs route to /journals
// even if product_type would otherwise classify them elsewhere.
// Word-boundary matching (\b) is used on product_type tokens so compound types
// like "enamel-mug-11oz" or "embroidered-cap" hit the apparel/accessories rules.
const CATEGORY_RULES = [
  { match: /-journal$|-journal-/, category: 'journals' },
  { match: /journal/, category: 'journals', useType: true },
  { match: /\b(hoodie|tee|cap|jumper|sweatshirt)\b/, category: 'apparel', useType: true },
  { match: /\b(mug|tote|pin|lanyard|bottle)\b|sticker-pack/, category: 'accessories', useType: true },
  { match: /\b(pdf|notion|digital|printable)\b/, category: 'digital', useType: true },
];

/**
 * Determine which top-level category a product belongs to.
 * Inspects slug first, then productFormat. Defaults to 'journals'.
 */
export function resolveCategory(slug, productFormat) {
  for (const rule of CATEGORY_RULES) {
    const target = rule.useType ? (productFormat || '') : slug;
    if (rule.match.test(target)) return rule.category;
  }
  return 'journals';
}

/**
 * Stable hash of a string → unsigned 32-bit int.
 * Used to deterministically pick cross-sell products per slug.
 */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick 4 cross-sell slugs for a given product.
 * Same-category first; tops up from any other category if < 4 in same category.
 * Deterministic per slug — same input always returns same output.
 */
export function pickCrossSell(currentSlug, allProducts) {
  const current = allProducts.find((p) => p.slug === currentSlug);
  if (!current) return [];
  const sameCategory = allProducts.filter(
    (p) => p.slug !== currentSlug && p.category === current.category
  );
  const otherCategory = allProducts.filter(
    (p) => p.slug !== currentSlug && p.category !== current.category
  );
  const ordered = [...sortByHash(sameCategory, currentSlug), ...sortByHash(otherCategory, currentSlug)];
  return ordered.slice(0, 4).map((p) => p.slug);
}

function sortByHash(products, seed) {
  return [...products].sort((a, b) => {
    const ha = hashString(seed + ':' + a.slug);
    const hb = hashString(seed + ':' + b.slug);
    return ha - hb;
  });
}
