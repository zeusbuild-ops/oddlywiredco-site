import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const products = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/products' }),
  schema: z.object({
    slug: z.string(),
    name: z.string(),
    productName: z.string(),
    tagline: z.string(),
    etsyId: z.string(),
    etsyUrl: z.string().url(),
    priceGbp: z.number(),
    mode: z.enum(['loud', 'soft']),
    seoTitle: z.string(),
    seoDescription: z.string(),
    images: z.array(z.string()),
  }),
});

export const collections = { products };
