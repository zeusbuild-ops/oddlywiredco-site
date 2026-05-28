import type { APIRoute } from 'astro';
import { allProducts } from '../types/product';

export const prerender = true;

const SITE = 'https://oddlywiredco.com';

export const GET: APIRoute = () => {
  const urls = allProducts
    .map(
      (p) => `  <url>
    <loc>${SITE}/${p.category}/${p.slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
