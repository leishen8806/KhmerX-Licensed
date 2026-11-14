ALTER TABLE partner_outbox ADD COLUMN requeued_at TEXT;
ALTER TABLE partner_outbox ADD COLUMN requeue_count INTEGER NOT NULL DEFAULT 0;
