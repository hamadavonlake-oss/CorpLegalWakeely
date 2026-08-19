-- ═════════════════════════════════════════════════════════════════════
-- Phase 4 Migration — Documents, Document Versions, Templates, Clauses
--   1. Create documents, document_versions, templates, clauses,
--      template_clauses tables.
--   2. Add FK from contract_document_links.document_id to documents.id
--      (Phase 3 left it as a free-text string).
--   3. Enable RLS + FORCE RLS on all 5 new tables + contract_document_links
--      (already RLS-enabled in Phase 3, but we add the document_id FK here).
--   4. Define tenant_isolation policies on all new tables.
-- Backward-compatible: no existing column types change.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. documents table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "documents" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "contract_id"       TEXT,
    "matter_id"         TEXT,
    "legal_request_id"  TEXT,
    "document_number"   TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "title_en"          TEXT,
    "description"       TEXT,
    "type"              TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'draft',
    "classification"    TEXT NOT NULL DEFAULT 'internal',
    "mime_type"         TEXT,
    "size_bytes"        INTEGER,
    "content_hash"      TEXT,
    "virus_scan_status" TEXT NOT NULL DEFAULT 'pending',
    "current_version"   INTEGER NOT NULL DEFAULT 1,
    "uploaded_by"       TEXT NOT NULL,
    "approved_by"       TEXT,
    "approved_at"       TIMESTAMP(3),
    "legal_hold"        BOOLEAN NOT NULL DEFAULT false,
    "retention_until"   TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMP(3),
    "deleted_by"        TEXT,
    "row_version"       INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- Status enum validation (7 states per PRD)
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_status_check"
  CHECK ("status" IN (
    'draft', 'under_review', 'changes_requested', 'approved',
    'exported', 'filed', 'archived'
  ));

-- Virus scan status enum validation
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_virus_scan_status_check"
  CHECK ("virus_scan_status" IN ('pending', 'clean', 'infected', 'error'));

-- Classification enum validation
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_classification_check"
  CHECK ("classification" IN ('public', 'internal', 'confidential', 'restricted'));

-- Size must be non-negative
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_size_bytes_check"
  CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0);

-- Current version must be >= 1
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_current_version_check"
  CHECK ("current_version" >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS "documents_organization_id_document_number_key"
  ON "documents" ("organization_id", "document_number");

CREATE INDEX IF NOT EXISTS "documents_organization_id_status_idx"
  ON "documents" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "documents_contract_id_idx"
  ON "documents" ("contract_id");

CREATE INDEX IF NOT EXISTS "documents_matter_id_idx"
  ON "documents" ("matter_id");

CREATE INDEX IF NOT EXISTS "documents_legal_request_id_idx"
  ON "documents" ("legal_request_id");

CREATE INDEX IF NOT EXISTS "documents_uploaded_by_idx"
  ON "documents" ("uploaded_by");

CREATE INDEX IF NOT EXISTS "documents_status_idx"
  ON "documents" ("status");

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_matter_id_fkey"
  FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_legal_request_id_fkey"
  FOREIGN KEY ("legal_request_id") REFERENCES "legal_requests"("id") ON DELETE SET NULL;

-- ─── 2. document_versions table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_versions" (
    "id"                TEXT NOT NULL,
    "document_id"       TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "version_number"    INTEGER NOT NULL,
    "storage_key"       TEXT NOT NULL,
    "filename"          TEXT NOT NULL,
    "mime_type"         TEXT NOT NULL,
    "size_bytes"        INTEGER NOT NULL,
    "content_hash"      TEXT NOT NULL,
    "change_summary"    TEXT,
    "uploaded_by"       TEXT NOT NULL,
    "approved_by"       TEXT,
    "approved_at"       TIMESTAMP(3),
    "virus_scan_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_virus_scan_status_check"
  CHECK ("virus_scan_status" IN ('pending', 'clean', 'infected', 'error'));

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_version_number_check"
  CHECK ("version_number" >= 1);

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_size_bytes_check"
  CHECK ("size_bytes" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_document_id_version_number_key"
  ON "document_versions" ("document_id", "version_number");

CREATE INDEX IF NOT EXISTS "document_versions_document_id_idx"
  ON "document_versions" ("document_id");

CREATE INDEX IF NOT EXISTS "document_versions_organization_id_idx"
  ON "document_versions" ("organization_id");

CREATE INDEX IF NOT EXISTS "document_versions_content_hash_idx"
  ON "document_versions" ("content_hash");

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 3. templates table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "templates" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "template_code"     TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "name_en"           TEXT,
    "description"       TEXT,
    "type"              TEXT NOT NULL,
    "storage_key"       TEXT NOT NULL,
    "filename"          TEXT NOT NULL,
    "variables_schema"  JSONB,
    "default_values"    JSONB,
    "country_code"      TEXT,
    "locale"            TEXT NOT NULL DEFAULT 'ar',
    "version"           INTEGER NOT NULL DEFAULT 1,
    "is_active"         BOOLEAN NOT NULL DEFAULT true,
    "created_by"        TEXT NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMP(3),
    "deleted_by"        TEXT,
    "row_version"       INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "templates"
  ADD CONSTRAINT "templates_version_check"
  CHECK ("version" >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS "templates_organization_id_template_code_key"
  ON "templates" ("organization_id", "template_code");

CREATE INDEX IF NOT EXISTS "templates_organization_id_type_idx"
  ON "templates" ("organization_id", "type");

CREATE INDEX IF NOT EXISTS "templates_organization_id_is_active_idx"
  ON "templates" ("organization_id", "is_active");

ALTER TABLE "templates"
  ADD CONSTRAINT "templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 4. clauses table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "clauses" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "code"              TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "title_en"          TEXT,
    "category"          TEXT NOT NULL,
    "body_text"         TEXT NOT NULL,
    "body_text_en"      TEXT,
    "variables"         JSONB,
    "country_code"      TEXT,
    "is_active"         BOOLEAN NOT NULL DEFAULT true,
    "version"           INTEGER NOT NULL DEFAULT 1,
    "created_by"        TEXT NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMP(3),
    "deleted_by"        TEXT,
    "row_version"       INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "clauses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clauses_organization_id_code_key"
  ON "clauses" ("organization_id", "code");

CREATE INDEX IF NOT EXISTS "clauses_organization_id_category_idx"
  ON "clauses" ("organization_id", "category");

CREATE INDEX IF NOT EXISTS "clauses_organization_id_is_active_idx"
  ON "clauses" ("organization_id", "is_active");

ALTER TABLE "clauses"
  ADD CONSTRAINT "clauses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 5. template_clauses table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "template_clauses" (
    "id"                TEXT NOT NULL,
    "template_id"       TEXT NOT NULL,
    "clause_id"         TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "placeholder_name"  TEXT NOT NULL,
    "sort_order"        INTEGER NOT NULL DEFAULT 0,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_clauses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "template_clauses_template_id_clause_id_placeholder_name_key"
  ON "template_clauses" ("template_id", "clause_id", "placeholder_name");

CREATE INDEX IF NOT EXISTS "template_clauses_template_id_idx"
  ON "template_clauses" ("template_id");

CREATE INDEX IF NOT EXISTS "template_clauses_clause_id_idx"
  ON "template_clauses" ("clause_id");

CREATE INDEX IF NOT EXISTS "template_clauses_organization_id_idx"
  ON "template_clauses" ("organization_id");

ALTER TABLE "template_clauses"
  ADD CONSTRAINT "template_clauses_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE;

ALTER TABLE "template_clauses"
  ADD CONSTRAINT "template_clauses_clause_id_fkey"
  FOREIGN KEY ("clause_id") REFERENCES "clauses"("id") ON DELETE CASCADE;

ALTER TABLE "template_clauses"
  ADD CONSTRAINT "template_clauses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 6. Add FK from contract_document_links.document_id to documents ──
-- Phase 3 left document_id as a free-text string. Now we add the real FK.
-- This is safe because the table is empty (Phase 4 hasn't created any documents yet).
ALTER TABLE "contract_document_links"
  DROP CONSTRAINT IF EXISTS "contract_document_links_document_id_fkey";
ALTER TABLE "contract_document_links"
  ADD CONSTRAINT "contract_document_links_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;

-- ─── 7. RLS activation on all 5 new tables ────────────────────────────
DO $$
DECLARE
  t TEXT;
  new_tables TEXT[] := ARRAY[
    'documents',
    'document_versions',
    'templates',
    'clauses',
    'template_clauses'
  ];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── 8. Tenant isolation policies ────────────────────────────────────
-- Each table has organization_id as a direct column.

DROP POLICY IF EXISTS "tenant_isolation" ON "documents";
CREATE POLICY "tenant_isolation" ON "documents"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "document_versions";
CREATE POLICY "tenant_isolation" ON "document_versions"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "templates";
CREATE POLICY "tenant_isolation" ON "templates"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "clauses";
CREATE POLICY "tenant_isolation" ON "clauses"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "template_clauses";
CREATE POLICY "tenant_isolation" ON "template_clauses"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));
