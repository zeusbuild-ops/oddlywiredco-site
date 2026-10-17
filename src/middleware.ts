import { defineMiddleware } from 'astro:middleware';
import site from './data/site.json';

// While the shop is "coming soon", every page on the live site shows
// /coming-soon instead. Kept open: the signup endpoint, payment/fulfilment
// webhooks (so any order already in flight still completes), and legal pages.
// Local dev is never gated, so the full site can be worked on and previewed.
const OPEN = [
  /^\/coming-soon\/?$/,
  /^\/api\/subscribe\/?$/,
  /^\/api\/webhooks\//,
  /^\/legal\//,
];

export const onRequest = defineMiddleware((context, next) => {
  // Pre-built static pages (review thanks page, product sitemap) are served as
  // files and never reach this gate at runtime, so don't rewrite them at build time.
  if (!site.comingSoon || import.meta.env.DEV || context.isPrerendered) return next();
  const path = context.url.pathname;
  if (OPEN.some((re) => re.test(path))) return next();
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'The shop opens soon.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  return context.rewrite('/coming-soon');
});
