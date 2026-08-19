-- ═════════════════════════════════════════════════════════════════════
-- Phase 5 Migration — Approvals Engine
--   1. Create approval_rules, approval_rule_conditions,
--      approval_rule_steps, approval_instances, approval_instance_steps.
--   2. Enable RLS + FORCE RLS on all 5 new tables.
--   3. Define tenant_isolation policies.
-- Per ADR-008: sequential/parallel/delegation approvals with escalation.
-- Backward-compatible: no existing column types change.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. approval_rules table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "approval_rules" (
    "id"                  TEXT NOT NULL,
    "organization_id"     TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "name_en"             TEXT,
    "description"         TEXT,
    "object_type"         TEXT NOT NULL,
    "priority"            INTEGER NOT NULL DEFAULT 100,
    "approval_type"       TEXT NOT NULL DEFAULT 'sequential',
    "is_active"           BOOLEAN NOT NULL DEFAULT true,
    "is_required"         BOOLEAN NOT NULL DEFAULT true,
    "escalation_minutes"  INTEGER,
    "created_by"          TEXT NOT NULL,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"          TIMESTAMP(3),
    "deleted_by"          TEXT,
    "row_version"         INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_rules"
  ADD CONSTRAINT "approval_rules_object_type_check"
  CHECK ("object_type" IN ('contract', 'document'));

ALTER TABLE "approval_rules"
  ADD CONSTRAINT "approval_rules_approval_type_check"
  CHECK ("approval_type" IN ('sequential', 'parallel'));

ALTER TABLE "approval_rules"
  ADD CONSTRAINT "approval_rules_priority_check"
  CHECK ("priority" >= 0);

ALTER TABLE "approval_rules"
  ADD CONSTRAINT "approval_rules_escalation_minutes_check"
  CHECK ("escalation_minutes" IS NULL OR "escalation_minutes" > 0);

CREATE INDEX IF NOT EXISTS "approval_rules_organization_id_object_type_is_active_idx"
  ON "approval_rules" ("organization_id", "object_type", "is_active");

CREATE INDEX IF NOT EXISTS "approval_rules_organization_id_priority_idx"
  ON "approval_rules" ("organization_id", "priority");

ALTER TABLE "approval_rules"
  ADD CONSTRAINT "approval_rules_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 2. approval_rule_conditions table ────────────────────────────────
CREATE TABLE IF NOT EXISTS "approval_rule_conditions" (
    "id"                TEXT NOT NULL,
    "rule_id"           TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "field"             TEXT NOT NULL,
    "operator"          TEXT NOT NULL,
    "value"             TEXT NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_rule_conditions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_rule_conditions"
  ADD CONSTRAINT "approval_rule_conditions_field_check"
  CHECK ("field" IN ('type', 'category', 'total_value', 'total_currency', 'country_code', 'entity_id', 'classification'));

ALTER TABLE "approval_rule_conditions"
  ADD CONSTRAINT "approval_rule_conditions_operator_check"
  CHECK ("operator" IN ('equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'in', 'contains'));

CREATE INDEX IF NOT EXISTS "approval_rule_conditions_rule_id_idx"
  ON "approval_rule_conditions" ("rule_id");

CREATE INDEX IF NOT EXISTS "approval_rule_conditions_organization_id_idx"
  ON "approval_rule_conditions" ("organization_id");

ALTER TABLE "approval_rule_conditions"
  ADD CONSTRAINT "approval_rule_conditions_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "approval_rules"("id") ON DELETE CASCADE;

ALTER TABLE "approval_rule_conditions"
  ADD CONSTRAINT "approval_rule_conditions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 3. approval_rule_steps table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "approval_rule_steps" (
    "id"                TEXT NOT NULL,
    "rule_id"           TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "step_order"        INTEGER NOT NULL,
    "name"              TEXT NOT NULL,
    "name_en"           TEXT,
    "approver_role"     TEXT,
    "assigned_user_id"  TEXT,
    "can_delegate"      BOOLEAN NOT NULL DEFAULT false,
    "can_skip"          BOOLEAN NOT NULL DEFAULT false,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_rule_steps_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_rule_steps"
  ADD CONSTRAINT "approval_rule_steps_step_order_check"
  CHECK ("step_order" >= 1);

CREATE INDEX IF NOT EXISTS "approval_rule_steps_rule_id_idx"
  ON "approval_rule_steps" ("rule_id");

CREATE INDEX IF NOT EXISTS "approval_rule_steps_organization_id_idx"
  ON "approval_rule_steps" ("organization_id");

ALTER TABLE "approval_rule_steps"
  ADD CONSTRAINT "approval_rule_steps_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "approval_rules"("id") ON DELETE CASCADE;

ALTER TABLE "approval_rule_steps"
  ADD CONSTRAINT "approval_rule_steps_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 4. approval_instances table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "approval_instances" (
    "id"                  TEXT NOT NULL,
    "organization_id"     TEXT NOT NULL,
    "rule_id"             TEXT NOT NULL,
    "object_type"         TEXT NOT NULL,
    "object_id"           TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'pending',
    "current_step_order"  INTEGER,
    "submitted_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"        TIMESTAMP(3),
    "submitted_by"        TEXT NOT NULL,
    "submit_notes"        TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_instances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_instances"
  ADD CONSTRAINT "approval_instances_object_type_check"
  CHECK ("object_type" IN ('contract', 'document'));

ALTER TABLE "approval_instances"
  ADD CONSTRAINT "approval_instances_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected', 'changes_requested', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS "approval_instances_organization_id_object_type_object_id_idx"
  ON "approval_instances" ("organization_id", "object_type", "object_id");

CREATE INDEX IF NOT EXISTS "approval_instances_organization_id_status_idx"
  ON "approval_instances" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "approval_instances_rule_id_idx"
  ON "approval_instances" ("rule_id");

ALTER TABLE "approval_instances"
  ADD CONSTRAINT "approval_instances_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "approval_rules"("id") ON DELETE RESTRICT;

ALTER TABLE "approval_instances"
  ADD CONSTRAINT "approval_instances_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 5. approval_instance_steps table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "approval_instance_steps" (
    "id"                TEXT NOT NULL,
    "instance_id"       TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "rule_step_id"      TEXT,
    "step_order"        INTEGER NOT NULL,
    "name"              TEXT NOT NULL,
    "name_en"           TEXT,
    "assigned_to"       TEXT NOT NULL,
    "original_assignee" TEXT,
    "status"            TEXT NOT NULL DEFAULT 'pending',
    "decided_by"        TEXT,
    "decided_at"        TIMESTAMP(3),
    "decision_notes"    TEXT,
    "delegated_to"      TEXT,
    "escalated_at"      TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_instance_steps_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_instance_steps"
  ADD CONSTRAINT "approval_instance_steps_step_order_check"
  CHECK ("step_order" >= 1);

ALTER TABLE "approval_instance_steps"
  ADD CONSTRAINT "approval_instance_steps_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected', 'changes_requested', 'delegated', 'skipped', 'escalated'));

CREATE INDEX IF NOT EXISTS "approval_instance_steps_instance_id_idx"
  ON "approval_instance_steps" ("instance_id");

CREATE INDEX IF NOT EXISTS "approval_instance_steps_organization_id_status_idx"
  ON "approval_instance_steps" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "approval_instance_steps_assigned_to_idx"
  ON "approval_instance_steps" ("assigned_to");

CREATE INDEX IF NOT EXISTS "approval_instance_steps_rule_step_id_idx"
  ON "approval_instance_steps" ("rule_step_id");

ALTER TABLE "approval_instance_steps"
  ADD CONSTRAINT "approval_instance_steps_instance_id_fkey"
  FOREIGN KEY ("instance_id") REFERENCES "approval_instances"("id") ON DELETE CASCADE;

ALTER TABLE "approval_instance_steps"
  ADD CONSTRAINT "approval_instance_steps_rule_step_id_fkey"
  FOREIGN KEY ("rule_step_id") REFERENCES "approval_rule_steps"("id") ON DELETE SET NULL;

ALTER TABLE "approval_instance_steps"
  ADD CONSTRAINT "approval_instance_steps_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 6. RLS activation on all 5 new tables ────────────────────────────
DO $$
DECLARE
  t TEXT;
  new_tables TEXT[] := ARRAY[
    'approval_rules',
    'approval_rule_conditions',
    'approval_rule_steps',
    'approval_instances',
    'approval_instance_steps'
  ];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── 7. Tenant isolation policies ────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON "approval_rules";
CREATE POLICY "tenant_isolation" ON "approval_rules"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "approval_rule_conditions";
CREATE POLICY "tenant_isolation" ON "approval_rule_conditions"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "approval_rule_steps";
CREATE POLICY "tenant_isolation" ON "approval_rule_steps"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "approval_instances";
CREATE POLICY "tenant_isolation" ON "approval_instances"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "approval_instance_steps";
CREATE POLICY "tenant_isolation" ON "approval_instance_steps"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));
