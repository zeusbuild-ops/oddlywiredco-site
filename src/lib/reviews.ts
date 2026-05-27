// D1 query helpers for reviews + review_tokens.
// DB binding is `env.DB` per wrangler.toml; callers pass it in.
// Matches the `import { env } from 'cloudflare:workers'` pattern used by
// src/pages/api/subscribe.ts — DB is typed as `any` here to avoid pulling
// @cloudflare/workers-types as a dep.

export interface ReviewRow {
  id: string;
  product_slug: string;
  stripe_payment_intent_id: string;
  rating: number;
  body: string;
  reviewer_name: string;
  verified_buyer: number;
  status: 'published' | 'rejected';
  created_at: number;
}

export interface ReviewTokenRow {
  token: string;
  stripe_payment_intent_id: string;
  product_slug: string;
  buyer_email: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

export async function getPublishedReviewsForSlug(
  db: any,
  slug: string,
  limit = 5,
): Promise<ReviewRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM reviews
     WHERE product_slug = ?1 AND status = 'published'
     ORDER BY created_at DESC LIMIT ?2`
  ).bind(slug, limit).all();
  return (results ?? []) as ReviewRow[];
}

export async function getReviewCountAndAverage(
  db: any,
  slug: string,
): Promise<{ count: number; avg: number }> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg
     FROM reviews
     WHERE product_slug = ?1 AND status = 'published'`
  ).bind(slug).first() as { count: number; avg: number } | null;
  return { count: row?.count ?? 0, avg: row?.avg ?? 0 };
}

export async function getAllPublishedReviewsForSlug(
  db: any,
  slug: string,
): Promise<ReviewRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM reviews
     WHERE product_slug = ?1 AND status = 'published'
     ORDER BY created_at DESC`
  ).bind(slug).all();
  return (results ?? []) as ReviewRow[];
}

export async function getValidToken(
  db: any,
  token: string,
): Promise<ReviewTokenRow | null> {
  const row = await db.prepare(
    `SELECT * FROM review_tokens
     WHERE token = ?1 AND consumed_at IS NULL AND expires_at > ?2`
  ).bind(token, Math.floor(Date.now() / 1000)).first() as ReviewTokenRow | null;
  return row ?? null;
}

export async function insertReview(
  db: any,
  row: Omit<ReviewRow, 'verified_buyer' | 'status' | 'created_at'>,
): Promise<void> {
  await db.prepare(
    `INSERT INTO reviews (id, product_slug, stripe_payment_intent_id, rating, body, reviewer_name, verified_buyer, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 'published', ?7)`
  ).bind(row.id, row.product_slug, row.stripe_payment_intent_id, row.rating, row.body, row.reviewer_name, Math.floor(Date.now() / 1000)).run();
}

export async function consumeToken(db: any, token: string): Promise<void> {
  await db.prepare(
    `UPDATE review_tokens SET consumed_at = ?1 WHERE token = ?2`
  ).bind(Math.floor(Date.now() / 1000), token).run();
}

export async function insertToken(
  db: any,
  row: Omit<ReviewTokenRow, 'created_at' | 'consumed_at'>,
): Promise<void> {
  await db.prepare(
    `INSERT INTO review_tokens (token, stripe_payment_intent_id, product_slug, buyer_email, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(
    row.token, row.stripe_payment_intent_id, row.product_slug, row.buyer_email,
    Math.floor(Date.now() / 1000),
    row.expires_at,
  ).run();
}
