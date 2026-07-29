ALTER TABLE legacy_promotion_migrations ADD COLUMN journal_hash TEXT;
ALTER TABLE legacy_promotion_migrations ADD COLUMN journal_json TEXT;
ALTER TABLE legacy_promotion_migrations ADD COLUMN receipt_hash TEXT;
ALTER TABLE legacy_promotion_migrations ADD COLUMN receipt_json TEXT;
ALTER TABLE legacy_promotion_migrations ADD COLUMN pending_receipt_temp_token TEXT;
ALTER TABLE legacy_promotion_migrations ADD COLUMN pending_receipt_hash TEXT;
ALTER TABLE legacy_promotion_migrations ADD COLUMN pending_receipt_json TEXT;

CREATE TABLE IF NOT EXISTS generation_gc_transactions (
  project_id TEXT NOT NULL,
  token TEXT NOT NULL,
  transaction_hash TEXT,
  transaction_json TEXT,
  pending_temp_token TEXT,
  pending_transaction_hash TEXT,
  pending_transaction_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, token)
);
