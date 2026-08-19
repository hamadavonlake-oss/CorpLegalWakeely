-- ═════════════════════════════════════════════════════════════════════
-- Phase 2 Migration
--   1. Create conflict_checks table (polymorphic; parent_type + parent_id)
--   2. Add ConflictCheckParentType enum
--   3. Enable PostgreSQL Row-Level Security on every tenant-scoped table
--      and define tenant-isolation policies driven by the
--      `app.current_organization_id` session variable (set per-request
--      by TenantTransactionService via `set_config(..., true)`).
--   4. FORCE RLS so that even the table owner is subject to the policies
--      (defence in depth — application bugs cannot leak across tenants).
-- Backward-compatible: no existing column types change, no data is
-- rewritten, no existing indexes are dropped.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. ConflictCheckParentType enum ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConflictCheckParentType') THEN
    CREATE TYPE "ConflictCheckParentType" AS ENUM ('matter', 'contract');
  END IF;
END $$;

-- ─── 2. conflict_checks table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "conflict_checks" (
    "id"                   TEXT NOT NULL,
    "organization_id"      TEXT NOT NULL,
    "parent_type"          "ConflictCheckParentType" NOT NULL,
    "parent_id"            TEXT NOT NULL,
    "status"               TEXT NOT NULL DEFAULT 'not_checked',
    "names"                JSONB NOT NULL DEFAULT '[]'::jsonb,
    "registration_numbers" JSONB,
    "notes"                TEXT,
    "checked_by"           TEXT,
    "checked_at"           TIMESTAMP(3),
    "result_summary"       TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"           TIMESTAMP(3),
    "deleted_by"           TEXT,
    "row_version"          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conflict_checks_pkey" PRIMARY KEY ("id")
);

-- Status enum validation (cheap defence — application code is the source of truth)
ALTER TABLE "conflict_checks"
  ADD CONSTRAINT "conflict_checks_status_check"
  CHECK ("status" IN ('not_checked','no_match','possible_match','requires_review','cleared_by_lawyer','blocked'));

-- Unique constraint: one check per parent (matter/contract)
CREATE UNIQUE INDEX IF NOT EXISTS "conflict_checks_parent_type_parent_id_key"
  ON "conflict_checks" ("parent_type", "parent_id");

CREATE INDEX IF NOT EXISTS "conflict_checks_organization_id_status_idx"
  ON "conflict_checks" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "conflict_checks_parent_type_parent_id_idx"
  ON "conflict_checks" ("parent_type", "parent_id");

CREATE INDEX IF NOT EXISTS "conflict_checks_checked_by_idx"
  ON "conflict_checks" ("checked_by");

-- FK to organizations
ALTER TABLE "conflict_checks"
  ADD CONSTRAINT "conflict_checks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 3. RLS activation ────────────────────────────────────────────────
-- The session variable `app.current_organization_id` is set per request by
-- TenantTransactionService via:
--     SELECT set_config('app.current_organization_id', '<uuid>', true)
-- The `true` flag scopes the variable to the current transaction, so two
-- concurrent requests in different tenants cannot leak.

-- Helper: enable RLS + FORCE on a single tenant-scoped table.
-- FORCE ensures the policy applies even to the table owner (superusers
-- bypass RLS by default; we want defence in depth).
DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'organizations',
    'organization_settings',
    'entities',
    'departments',
    'users',
    'auth_sessions',
    'roles',
    'user_roles',
    'role_permissions',
    'legal_requests',
    'legal_request_matter_links',
    'matters',
    'audit_logs',
    'conflict_checks'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Enable RLS (idempotent)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Force the policy on the owner too (idempotent)
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── 4. Tenant isolation policies ────────────────────────────────────
-- For each table, define exactly one permissive policy:
--   USING (organization_id = current_setting('app.current_organization_id', true))
--   WITH CHECK (organization_id = current_setting('app.current_organization_id', true))
-- The `true` argument to current_setting means "missing setting returns NULL
-- rather than erroring" — combined with the equality check, that means a
-- request with no tenant context simply sees zero rows (fail-closed).

-- organizations
DROP POLICY IF EXISTS "tenant_isolation" ON "organizations";
CREATE POLICY "tenant_isolation" ON "organizations"
  FOR ALL
  USING (id = current_setting('app.current_organization_id', true))
  WITH CHECK (id = current_setting('app.current_organization_id', true));

-- organization_settings
DROP POLICY IF EXISTS "tenant_isolation" ON "organization_settings";
CREATE POLICY "tenant_isolation" ON "organization_settings"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- entities
DROP POLICY IF EXISTS "tenant_isolation" ON "entities";
CREATE POLICY "tenant_isolation" ON "entities"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- departments
DROP POLICY IF EXISTS "tenant_isolation" ON "departments";
CREATE POLICY "tenant_isolation" ON "departments"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- users
DROP POLICY IF EXISTS "tenant_isolation" ON "users";
CREATE POLICY "tenant_isolation" ON "users"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- auth_sessions (no organization_id column — linked through user_id → user.organization_id)
DROP POLICY IF EXISTS "tenant_isolation" ON "auth_sessions";
CREATE POLICY "tenant_isolation" ON "auth_sessions"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u.id = auth_sessions.user_id
        AND u.organization_id = current_setting('app.current_organization_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u.id = auth_sessions.user_id
        AND u.organization_id = current_setting('app.current_organization_id', true)
    )
  );

-- roles (organization_id is NULL for system roles — always visible)
DROP POLICY IF EXISTS "tenant_isolation" ON "roles";
CREATE POLICY "tenant_isolation" ON "roles"
  FOR ALL
  USING (
    organization_id IS NULL
    OR organization_id = current_setting('app.current_organization_id', true)
  )
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = current_setting('app.current_organization_id', true)
  );

-- user_roles (no organization_id — linked through user_id)
DROP POLICY IF EXISTS "tenant_isolation" ON "user_roles";
CREATE POLICY "tenant_isolation" ON "user_roles"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u.id = user_roles.user_id
        AND u.organization_id = current_setting('app.current_organization_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u.id = user_roles.user_id
        AND u.organization_id = current_setting('app.current_organization_id', true)
    )
  );

-- role_permissions (no organization_id — system-level mapping, always visible)
-- No RLS policy needed: rows are not tenant-scoped. We still enable RLS
-- (above) so a future column addition doesn't accidentally leak.
DROP POLICY IF EXISTS "tenant_isolation" ON "role_permissions";
CREATE POLICY "tenant_isolation" ON "role_permissions"
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- legal_requests
DROP POLICY IF EXISTS "tenant_isolation" ON "legal_requests";
CREATE POLICY "tenant_isolation" ON "legal_requests"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- legal_request_matter_links (no direct org column — derived from request + matter)
DROP POLICY IF EXISTS "tenant_isolation" ON "legal_request_matter_links";
CREATE POLICY "tenant_isolation" ON "legal_request_matter_links"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "legal_requests" lr
      WHERE lr.id = legal_request_matter_links.request_id
        AND lr.organization_id = current_setting('app.current_organization_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "legal_requests" lr
      WHERE lr.id = legal_request_matter_links.request_id
        AND lr.organization_id = current_setting('app.current_organization_id', true)
    )
  );

-- matters
DROP POLICY IF EXISTS "tenant_isolation" ON "matters";
CREATE POLICY "tenant_isolation" ON "matters"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- audit_logs
DROP POLICY IF EXISTS "tenant_isolation" ON "audit_logs";
CREATE POLICY "tenant_isolation" ON "audit_logs"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

-- conflict_checks
DROP POLICY IF EXISTS "tenant_isolation" ON "conflict_checks";
CREATE POLICY "tenant_isolation" ON "conflict_checks"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));
