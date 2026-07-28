CREATE TABLE IF NOT EXISTS release_reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('migration-visual-review', 'pdf-screen-reader-visual-review', 'rights-and-brand-review')),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  candidate_hash TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  html_sha256 TEXT NOT NULL,
  pdf_sha256 TEXT NOT NULL,
  epub_sha256 TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  qualified_role TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (candidate_hash) REFERENCES release_candidates(candidate_hash)
);

CREATE INDEX IF NOT EXISTS release_reviews_candidate_kind
  ON release_reviews(project_id, candidate_hash, kind, created_at, id);

CREATE TRIGGER IF NOT EXISTS release_reviews_no_update
BEFORE UPDATE ON release_reviews
BEGIN
  SELECT RAISE(ABORT, 'release review evidence is append-only');
END;

CREATE TRIGGER IF NOT EXISTS release_reviews_no_delete
BEFORE DELETE ON release_reviews
BEGIN
  SELECT RAISE(ABORT, 'release review evidence is append-only');
END;
