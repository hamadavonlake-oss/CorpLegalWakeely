-- ═════════════════════════════════════════════════════════════════════
-- Phase 8 Migration — Webhooks
--   1. Create webhooks + webhook_deliveries tables.
--   2. Enable RLS + FORCE RLS on both.
--   3. Define tenant_isolation policies.
-- Per ADR-011: HMAC-SHA256 signed webhooks, retry with exponential
-- backoff, dead-letter queue, SSRF prevention.
-- Backward-compatible: no existing column types change.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. webhooks table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "webhooks" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "name_en"           TEXT,
    "url"               TEXT NOT NULL,
    "secret_hash"       TEXT NOT NULL,
    "events"            JSONB NOT NULL DEFAULT '[]'::jsonb,
    "is_active"         BOOLEAN NOT NULL DEFAULT true,
    "verify_ssl"        BOOLEAN NOT NULL DEFAULT true,
    "secret_header_name" TEXT,
    "created_by"        TEXT NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMP(3),
    "deleted_by"        TEXT,
    "row_version"       INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhooks_organization_id_is_active_idx"
  ON "webhooks" ("organization_id", "is_active");

ALTER TABLE "webhooks"
  ADD CONSTRAINT "webhooks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 2. webhook_deliveries table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "webhook_id"        TEXT NOT NULL,
    "event_type"        TEXT NOT NULL,
    "payload"           JSONB NOT NULL,
    "signature"         TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'pending',
    "response_status"   INTEGER,
    "response_body"     VARCHAR(1000),
    "error_message"     TEXT,
    "attempt_count"     INTEGER NOT NULL DEFAULT 0,
    "max_attempts"      INTEGER NOT NULL DEFAULT 5,
    "next_retry_at"     TIMESTAMP(3),
    "first_attempt_at"  TIMESTAMP(3),
    "completed_at"      TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_status_check"
  CHECK ("status" IN ('pending', 'success', 'failed', 'dead_letter'));

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_attempt_count_check"
  CHECK ("attempt_count" >= 0);

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_max_attempts_check"
  CHECK ("max_attempts" >= 1 AND "max_attempts" <= 10);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_organization_id_status_idx"
  ON "webhook_deliveries" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_id_status_idx"
  ON "webhook_deliveries" ("webhook_id", "status");

CREATE INDEX IF NOT EXISTS "webhook_deliveries_next_retry_at_idx"
  ON "webhook_deliveries" ("next_retry_at");

CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_type_idx"
  ON "webhook_deliveries" ("event_type");

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey"
  FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE;

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 3. RLS activation on both new tables ────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  t := 'webhooks';
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  t := 'webhook_deliveries';
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
END $$;

DROP POLICY IF EXISTS "tenant_isolation" ON "webhooks";
CREATE POLICY "tenant_isolation" ON "webhooks"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "webhook_deliveries";
CREATE POLICY "tenant_isolation" ON "webhook_deliveries"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));
