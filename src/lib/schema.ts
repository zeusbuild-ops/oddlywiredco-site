import type { Product } from '../types/product';

const SITE_URL = 'https://oddlywiredco.com';
const BRAND_NAME = 'OddlyWiredCo';

const CATEGORY_LABEL: Record<Product['category'], string> = {
  journals: 'Journals',
  apparel: 'Apparel',
  accessories: 'Accessories',
  digital: 'Digital downloads',
};

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/og-image.png`,
    description:
      'ADHD-only direct shop. Journals, prints and accessories for the late-diagnosed and neurodivergent. UK-printed.',
    sameAs: [
      'https://www.etsy.com/shop/oddlywiredco',
      'https://www.pinterest.com/oddlywiredco/',
    ],
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND_NAME,
    url: `${SITE_URL}/`,
    inLanguage: 'en-GB',
  };
}

export function productSchema(product: Product): Record<string, unknown> {
  const productUrl = `${SITE_URL}/${product.category}/${product.slug}`;
  const price = (product.priceCents / 100).toFixed(2);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.hook,
    description: product.whyParagraph || product.hook,
    image: product.gallery && product.gallery.length > 0 ? product.gallery : [product.heroImage],
    sku: product.slug,
    mpn: product.slug,
    brand: { '@type': 'Brand', name: BRAND_NAME },
    category: CATEGORY_LABEL[product.category],
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'GBP',
      price,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: BRAND_NAME },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 5, unitCode: 'DAY' },
        },
      },
    },
  };
}

export function productBreadcrumbSchema(product: Product): Record<string, unknown> {
  const categoryLabel = CATEGORY_LABEL[product.category];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoryLabel,
        item: `${SITE_URL}/${product.category}`,
      },
      { '@type': 'ListItem', position: 3, name: product.hook },
    ],
  };
}

export function categoryBreadcrumbSchema(category: Product['category']): Record<string, unknown> {
  const categoryLabel = CATEGORY_LABEL[category];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoryLabel,
        item: `${SITE_URL}/${category}`,
      },
    ],
  };
}

export function faqPageSchema(faq: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((qa) => ({
      '@type': 'Question',
      name: qa.question,
      acceptedAnswer: { '@type': 'Answer', text: qa.answer },
    })),
  };
}

export function collectionPageSchema(
  category: Product['category'],
  description: string,
  products: Product[],
): Record<string, unknown> {
  const categoryLabel = CATEGORY_LABEL[category];
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${categoryLabel} — ${BRAND_NAME}`,
    description,
    url: `${SITE_URL}/${category}`,
    inLanguage: 'en-GB',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/${p.category}/${p.slug}`,
        name: p.hook,
      })),
    },
  };
}
