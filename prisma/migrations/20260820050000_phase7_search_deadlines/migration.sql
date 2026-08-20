-- ═════════════════════════════════════════════════════════════════════
-- Phase 7 Migration — Deadlines
--   1. Create deadlines table.
--   2. Enable RLS + FORCE RLS on deadlines.
--   3. Define tenant_isolation policy.
--   4. Create full-text search GIN indexes on legal_requests, matters,
--      contracts, documents for the search endpoint.
-- Backward-compatible: no existing column types change.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. deadlines table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deadlines" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "parent_type"     TEXT NOT NULL,
    "parent_id"       TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "title_en"        TEXT,
    "description"     TEXT,
    "due_date"        TIMESTAMP(3) NOT NULL,
    "reminder_days"   INTEGER NOT NULL DEFAULT 7,
    "reminder_sent"   BOOLEAN NOT NULL DEFAULT false,
    "assigned_to"     TEXT,
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "completed_at"    TIMESTAMP(3),
    "priority"        TEXT NOT NULL DEFAULT 'medium',
    "created_by"      TEXT NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"      TIMESTAMP(3),
    "deleted_by"      TEXT,
    "row_version"     INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "deadlines"
  ADD CONSTRAINT "deadlines_parent_type_check"
  CHECK ("parent_type" IN ('matter', 'contract', 'request'));

ALTER TABLE "deadlines"
  ADD CONSTRAINT "deadlines_status_check"
  CHECK ("status" IN ('pending', 'completed', 'overdue', 'cancelled'));

ALTER TABLE "deadlines"
  ADD CONSTRAINT "deadlines_priority_check"
  CHECK ("priority" IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE "deadlines"
  ADD CONSTRAINT "deadlines_reminder_days_check"
  CHECK ("reminder_days" >= 0);

CREATE INDEX IF NOT EXISTS "deadlines_organization_id_parent_type_parent_id_idx"
  ON "deadlines" ("organization_id", "parent_type", "parent_id");

CREATE INDEX IF NOT EXISTS "deadlines_organization_id_status_due_date_idx"
  ON "deadlines" ("organization_id", "status", "due_date");

CREATE INDEX IF NOT EXISTS "deadlines_organization_id_due_date_idx"
  ON "deadlines" ("organization_id", "due_date");

CREATE INDEX IF NOT EXISTS "deadlines_assigned_to_idx"
  ON "deadlines" ("assigned_to");

ALTER TABLE "deadlines"
  ADD CONSTRAINT "deadlines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 2. RLS activation on deadlines ──────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  t := 'deadlines';
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
END $$;

DROP POLICY IF EXISTS "tenant_isolation" ON "deadlines";
CREATE POLICY "tenant_isolation" ON "deadlines"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- ─── 3. Full-text search GIN indexes ─────────────────────────────────
-- These indexes enable fast ILIKE / full-text search on the search endpoint.
-- We use simple text search vectors (not language-specific) so Arabic
-- and English both work without stemming configuration.

-- legal_requests: search on title, title_en, description, request_number
CREATE INDEX IF NOT EXISTS "legal_requests_search_idx"
  ON "legal_requests"
  USING gin (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("title_en", '') || ' ' || coalesce("description", '') || ' ' || coalesce("request_number", ''))
  );

-- matters: search on title, title_en, description, matter_number
CREATE INDEX IF NOT EXISTS "matters_search_idx"
  ON "matters"
  USING gin (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("title_en", '') || ' ' || coalesce("description", '') || ' ' || coalesce("matter_number", ''))
  );

-- contracts: search on title, title_en, description, contract_number, counterparty_name
CREATE INDEX IF NOT EXISTS "contracts_search_idx"
  ON "contracts"
  USING gin (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("title_en", '') || ' ' || coalesce("description", '') || ' ' || coalesce("contract_number", '') || ' ' || coalesce("counterparty_name", '') || ' ' || coalesce("counterparty_name_en", ''))
  );

-- documents: search on title, title_en, description, document_number
CREATE INDEX IF NOT EXISTS "documents_search_idx"
  ON "documents"
  USING gin (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("title_en", '') || ' ' || coalesce("description", '') || ' ' || coalesce("document_number", ''))
  );
