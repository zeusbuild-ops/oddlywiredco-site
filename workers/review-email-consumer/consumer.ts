// Cloudflare Queue consumer worker — sends review-request emails via Brevo.
//
// Sibling to the main Astro site worker. Lives in its own deploy because the
// @astrojs/cloudflare adapter only generates a fetch-only worker entrypoint,
// and queue consumers need a `queue()` handler export.
//
// Bindings (from wrangler.toml):
//   - DB                D1 (oddlywiredco-newsletter)
//   - BREVO_API_KEY     secret (added separately at deploy time)
//
// Queue: review-emails (producer is the main site worker; see /api/webhooks/printify.ts)

interface QueueMessageBody {
  token: string;
  buyer_email: string;
  product_slug: string;
}

interface QueueMessage<T> {
  body: T;
  ack: () => void;
  retry: () => void;
}

interface MessageBatch<T> {
  queue: string;
  messages: QueueMessage<T>[];
}

interface Env {
  DB: any;
  BREVO_API_KEY: string;
}

interface ReviewTokenRow {
  token: string;
  stripe_payment_intent_id: string;
  product_slug: string;
  buyer_email: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

// Minimal product shape we need — title + heroImage. Slug map is built at deploy
// time from the same products.json the main site uses, so we don't need to
// re-import the full TS type system.
import productsData from '../../src/data/products.json';

interface ProductShape {
  slug: string;
  title: string;
  heroImage: string;
}

const productsBySlug: Record<string, ProductShape> = Object.fromEntries(
  (productsData as ProductShape[]).map((p) => [p.slug, p]),
);

async function getValidToken(db: any, token: string): Promise<ReviewTokenRow | null> {
  const row = (await db
    .prepare(
      `SELECT * FROM review_tokens
       WHERE token = ?1 AND consumed_at IS NULL AND expires_at > ?2`,
    )
    .bind(token, Math.floor(Date.now() / 1000))
    .first()) as ReviewTokenRow | null;
  return row ?? null;
}

async function brevoSend(args: {
  to: { email: string; name?: string };
  subject: string;
  htmlBody: string;
  apiKey: string;
  fromEmail?: string;
  fromName?: string;
}): Promise<void> {
  const {
    to,
    subject,
    htmlBody,
    apiKey,
    fromEmail = 'hello@oddlywiredco.com',
    fromName = 'OddlyWiredCo',
  } = args;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [to],
      subject,
      htmlContent: htmlBody,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`brevo send failed: ${res.status} ${text}`);
  }
}

function reviewRequestEmailHtml(args: {
  productTitle: string;
  productImage: string;
  reviewUrl: string;
  unsubscribeUrl: string;
}): string {
  return `<!doctype html>
<html><body style="font-family:Inter,system-ui,sans-serif;background:#F4EFE6;color:#0E0E11;padding:32px;line-height:1.6;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:8px;padding:32px;">
    <img src="${args.productImage}" alt="" style="width:100%;max-width:240px;display:block;margin:0 auto 24px;border-radius:6px;">
    <h1 style="font-family:Menlo,monospace;font-size:22px;font-weight:700;margin:0 0 14px;">what did your brain think?</h1>
    <p style="margin:0 0 18px;">your ${args.productTitle} arrived a week ago. if it landed, we'd love to hear how.</p>
    <p style="margin:0 0 24px;">tell us what your brain made of it. no template, no ratings essay — just a sentence is fine.</p>
    <a href="${args.reviewUrl}" style="display:inline-block;background:#4CE2C1;color:#0E0E11;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:700;font-family:Menlo,monospace;text-transform:uppercase;letter-spacing:1.5px;font-size:13px;">leave a review →</a>
    <p style="margin:32px 0 0;font-size:11px;opacity:0.55;">
      sent to verified buyers only. <a href="${args.unsubscribeUrl}" style="color:inherit;">unsubscribe</a>
    </p>
  </div>
</body></html>`;
}

export default {
  async queue(batch: MessageBatch<QueueMessageBody>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const { token, buyer_email, product_slug } = msg.body;

        const tokenRow = await getValidToken(env.DB, token);
        if (!tokenRow) {
          // Token expired or already consumed — drop silently.
          msg.ack();
          continue;
        }

        const product = productsBySlug[product_slug];
        if (!product) {
          msg.ack();
          continue;
        }

        const reviewUrl = `https://oddlywiredco.com/reviews/submit?token=${token}`;
        const unsubscribeUrl = `https://oddlywiredco.com/legal/privacy#unsubscribe`;

        await brevoSend({
          to: { email: buyer_email },
          subject: `what did your brain think? — your ${product.title} review`,
          htmlBody: reviewRequestEmailHtml({
            productTitle: product.title,
            productImage: product.heroImage,
            reviewUrl,
            unsubscribeUrl,
          }),
          apiKey: env.BREVO_API_KEY,
        });

        msg.ack();
      } catch (err) {
        console.error('review email queue error', err);
        msg.retry();
      }
    }
  },
};
