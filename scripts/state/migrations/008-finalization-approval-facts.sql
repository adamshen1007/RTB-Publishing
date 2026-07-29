ALTER TABLE release_finalizations ADD COLUMN approval_actor_type TEXT;
ALTER TABLE release_finalizations ADD COLUMN approval_actor_id TEXT;
ALTER TABLE release_finalizations ADD COLUMN approval_created_at TEXT;
ALTER TABLE release_finalizations ADD COLUMN approval_lifecycle_version INTEGER;
ALTER TABLE release_finalizations ADD COLUMN approval_bindings_json TEXT;
ALTER TABLE release_finalizations ADD COLUMN completed_while_current INTEGER NOT NULL DEFAULT 0;
