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
