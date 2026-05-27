-- Reviews + review_tokens for site-native review collection.
-- Triggered by Printify shipment webhook, fulfilled by Cloudflare Queue
-- consumer that sends a Brevo email after a 7-day delay.

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  verified_buyer INTEGER DEFAULT 1,
  status TEXT DEFAULT 'published'
    CHECK (status IN ('published','rejected')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_slug
  ON reviews(product_slug, status, created_at DESC);

CREATE TABLE IF NOT EXISTS review_tokens (
  token TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
