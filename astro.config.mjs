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
      filter: (page) => {
        if (page.includes('/checkout/')) return false;
        if (page.includes('/reviews/submit')) return false;
        if (page.includes('/reviews/thanks')) return false;
        if (page.match(/\/[a-z]+\/[a-z0-9-]+\/reviews$/)) return false;
        return true;
      },
    }),
  ],
  site: 'https://oddlywiredco.com',
});
