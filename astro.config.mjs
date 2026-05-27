import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/checkout/'),
    }),
  ],
  site: 'https://oddlywiredco.com',
});
