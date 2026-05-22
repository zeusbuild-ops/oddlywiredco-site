CREATE TABLE IF NOT EXISTS newsletter_signups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT DEFAULT (datetime('now')),
  source      TEXT DEFAULT 'site_v1',
  user_agent  TEXT,
  ip_hash     TEXT
);

CREATE INDEX IF NOT EXISTS idx_newsletter_signups_created_at ON newsletter_signups(created_at);
