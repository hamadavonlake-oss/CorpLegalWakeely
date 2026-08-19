-- ═════════════════════════════════════════════════════════════════════
-- Phase 3 Migration — Contracts
--   1. Create contracts, contract_parties, contract_values,
--      contract_signatures, contract_document_links tables.
--   2. Enable RLS + FORCE RLS on all 5 new tables.
--   3. Define tenant_isolation policies driven by
--      app.current_organization_id session variable.
-- Backward-compatible: no existing column types change, no data is rewritten.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. contracts table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contracts" (
    "id"                  TEXT NOT NULL,
    "organization_id"     TEXT NOT NULL,
    "entity_id"          TEXT,
    "matter_id"          TEXT,
    "contract_number"    TEXT NOT NULL,
    "title"              TEXT NOT NULL,
    "title_en"           TEXT,
    "description"        TEXT,
    "type"               TEXT,
    "category"           TEXT,
    "status"             TEXT NOT NULL DEFAULT 'draft',
    "priority"           TEXT DEFAULT 'medium',
    "effective_date"     TIMESTAMP(3),
    "expiry_date"        TIMESTAMP(3),
    "counterparty_name"  TEXT,
    "counterparty_name_en" TEXT,
    "total_value"        DECIMAL(18,3),
    "total_currency"     TEXT,
    "assigned_to"        TEXT,
    "created_by"         TEXT NOT NULL,
    "classification"     TEXT NOT NULL DEFAULT 'internal',
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"         TIMESTAMP(3),
    "deleted_by"         TEXT,
    "row_version"        INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- Status enum validation (defence in depth — 13 states per PRD)
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_status_check"
  CHECK ("status" IN (
    'draft', 'under_review', 'changes_requested', 'pending_approval',
    'approved', 'pending_signature', 'signed', 'active',
    'expired', 'terminated', 'archived', 'rejected', 'draft_new_version'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_organization_id_contract_number_key"
  ON "contracts" ("organization_id", "contract_number");

CREATE INDEX IF NOT EXISTS "contracts_organization_id_status_idx"
  ON "contracts" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "contracts_matter_id_idx"
  ON "contracts" ("matter_id");

CREATE INDEX IF NOT EXISTS "contracts_entity_id_idx"
  ON "contracts" ("entity_id");

CREATE INDEX IF NOT EXISTS "contracts_assigned_to_idx"
  ON "contracts" ("assigned_to");

CREATE INDEX IF NOT EXISTS "contracts_effective_date_idx"
  ON "contracts" ("effective_date");

CREATE INDEX IF NOT EXISTS "contracts_expiry_date_idx"
  ON "contracts" ("expiry_date");

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_entity_id_fkey"
  FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL;

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_matter_id_fkey"
  FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL;

-- ─── 2. contract_parties table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contract_parties" (
    "id"                TEXT NOT NULL,
    "contract_id"       TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "party_type"        TEXT NOT NULL,
    "entity_id"         TEXT,
    "name"              TEXT NOT NULL,
    "name_en"           TEXT,
    "role"              TEXT NOT NULL,
    "contact_info"      JSONB,
    "registration_no"   TEXT,
    "tax_id"            TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contract_parties"
  ADD CONSTRAINT "contract_parties_party_type_check"
  CHECK ("party_type" IN ('internal', 'external'));

CREATE INDEX IF NOT EXISTS "contract_parties_contract_id_idx"
  ON "contract_parties" ("contract_id");

CREATE INDEX IF NOT EXISTS "contract_parties_organization_id_idx"
  ON "contract_parties" ("organization_id");

CREATE INDEX IF NOT EXISTS "contract_parties_entity_id_idx"
  ON "contract_parties" ("entity_id");

ALTER TABLE "contract_parties"
  ADD CONSTRAINT "contract_parties_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE;

ALTER TABLE "contract_parties"
  ADD CONSTRAINT "contract_parties_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "contract_parties"
  ADD CONSTRAINT "contract_parties_entity_id_fkey"
  FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL;

-- ─── 3. contract_values table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contract_values" (
    "id"                TEXT NOT NULL,
    "contract_id"       TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "value_type"        TEXT NOT NULL,
    "description"       TEXT,
    "amount"            DECIMAL(18,3) NOT NULL,
    "currency"          TEXT NOT NULL,
    "year"              INTEGER,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_values_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contract_values"
  ADD CONSTRAINT "contract_values_value_type_check"
  CHECK ("value_type" IN ('base', 'tax', 'fee', 'discount', 'penalty'));

ALTER TABLE "contract_values"
  ADD CONSTRAINT "contract_values_amount_check"
  CHECK ("amount" >= 0);

CREATE INDEX IF NOT EXISTS "contract_values_contract_id_idx"
  ON "contract_values" ("contract_id");

CREATE INDEX IF NOT EXISTS "contract_values_organization_id_idx"
  ON "contract_values" ("organization_id");

ALTER TABLE "contract_values"
  ADD CONSTRAINT "contract_values_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE;

ALTER TABLE "contract_values"
  ADD CONSTRAINT "contract_values_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 4. contract_signatures table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contract_signatures" (
    "id"                    TEXT NOT NULL,
    "contract_id"           TEXT NOT NULL,
    "organization_id"       TEXT NOT NULL,
    "signer_name"           TEXT NOT NULL,
    "signer_name_en"        TEXT,
    "signer_title"          TEXT,
    "signer_user_id"        TEXT,
    "sequence"              INTEGER NOT NULL DEFAULT 1,
    "status"                TEXT NOT NULL DEFAULT 'pending',
    "signed_at"              TIMESTAMP(3),
    "signed_document_url"    TEXT,
    "notes"                  TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contract_signatures"
  ADD CONSTRAINT "contract_signatures_status_check"
  CHECK ("status" IN ('pending', 'signed', 'declined', 'unknown'));

ALTER TABLE "contract_signatures"
  ADD CONSTRAINT "contract_signatures_sequence_check"
  CHECK ("sequence" >= 1);

CREATE INDEX IF NOT EXISTS "contract_signatures_contract_id_idx"
  ON "contract_signatures" ("contract_id");

CREATE INDEX IF NOT EXISTS "contract_signatures_organization_id_idx"
  ON "contract_signatures" ("organization_id");

CREATE INDEX IF NOT EXISTS "contract_signatures_signer_user_id_idx"
  ON "contract_signatures" ("signer_user_id");

ALTER TABLE "contract_signatures"
  ADD CONSTRAINT "contract_signatures_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE;

ALTER TABLE "contract_signatures"
  ADD CONSTRAINT "contract_signatures_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 5. contract_document_links table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "contract_document_links" (
    "id"                TEXT NOT NULL,
    "contract_id"       TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "document_id"       TEXT NOT NULL,
    "link_type"         TEXT NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_document_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contract_document_links"
  ADD CONSTRAINT "contract_document_links_link_type_check"
  CHECK ("link_type" IN ('source', 'signed_copy', 'amendment', 'exhibit'));

CREATE UNIQUE INDEX IF NOT EXISTS "contract_document_links_contract_id_document_id_link_type_key"
  ON "contract_document_links" ("contract_id", "document_id", "link_type");

CREATE INDEX IF NOT EXISTS "contract_document_links_contract_id_idx"
  ON "contract_document_links" ("contract_id");

CREATE INDEX IF NOT EXISTS "contract_document_links_organization_id_idx"
  ON "contract_document_links" ("organization_id");

ALTER TABLE "contract_document_links"
  ADD CONSTRAINT "contract_document_links_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE;

ALTER TABLE "contract_document_links"
  ADD CONSTRAINT "contract_document_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 6. RLS activation on all 5 new tables ────────────────────────────
DO $$
DECLARE
  t TEXT;
  new_tables TEXT[] := ARRAY[
    'contracts',
    'contract_parties',
    'contract_values',
    'contract_signatures',
    'contract_document_links'
  ];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── 7. Tenant isolation policies ────────────────────────────────────
-- Each table has organization_id as a direct column, so the policy is simple.

DROP POLICY IF EXISTS "tenant_isolation" ON "contracts";
CREATE POLICY "tenant_isolation" ON "contracts"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "contract_parties";
CREATE POLICY "tenant_isolation" ON "contract_parties"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "contract_values";
CREATE POLICY "tenant_isolation" ON "contract_values"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "contract_signatures";
CREATE POLICY "tenant_isolation" ON "contract_signatures"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "contract_document_links";
CREATE POLICY "tenant_isolation" ON "contract_document_links"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));
