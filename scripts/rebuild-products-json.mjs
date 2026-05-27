#!/usr/bin/env node
/**
 * Rebuild src/data/products.json from the sibling OddlyWiredCo project's
 * Printify + Stripe build artifacts.
 *
 * Usage:
 *   node scripts/rebuild-products-json.mjs
 *
 * Env:
 *   OWC_BUILD_DIR  Path to OddlyWiredCo project's build/ directory.
 *                  Default: ../OddlyWiredCo/.claude/worktrees/beautiful-meitner-fc86ff/build
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHook } from './lib/extract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const BUILD_DIR = process.env.OWC_BUILD_DIR
  ?? resolve(SITE_ROOT, '..', 'OddlyWiredCo/.claude/worktrees/beautiful-meitner-fc86ff/build');

console.log(`reading from: ${BUILD_DIR}`);

const mapping = JSON.parse(
  readFileSync(resolve(BUILD_DIR, 'phase-3-stripe/stripe-products-mapping.json'), 'utf8')
);

const products = mapping.map((p) => ({
  slug: p.slug,
  title: p.title,
  hook: extractHook(p.title),
  priceCents: p.price_cents,
}));

console.log(`processed ${products.length} products`);
console.log('first product:', JSON.stringify(products[0], null, 2));
