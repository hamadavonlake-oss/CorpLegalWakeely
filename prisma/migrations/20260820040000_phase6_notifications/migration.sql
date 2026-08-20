-- ═════════════════════════════════════════════════════════════════════
-- Phase 6 Migration — Notifications
--   1. Create notifications + notification_preferences tables.
--   2. Enable RLS + FORCE RLS on both new tables.
--   3. Define tenant_isolation policies.
-- Per ADR-011 / build-pack/02-mvp-prd.md:
-- - In-app notifications via Server-Sent Events (SSE)
-- - Persistent storage + polling fallback
-- - Email stubs (real email deferred to Phase 8)
-- - User preferences
-- Backward-compatible: no existing column types change.
-- ═════════════════════════════════════════════════════════════════════

-- ─── 1. notifications table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "user_id"           TEXT NOT NULL,
    "type"              TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "body"              TEXT NOT NULL,
    "severity"          TEXT NOT NULL DEFAULT 'info',
    "action_url"        TEXT,
    "object_type"       TEXT,
    "object_id"         TEXT,
    "read_at"           TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for"     TIMESTAMP(3),
    "delivery_status"   TEXT NOT NULL DEFAULT 'delivered',

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Severity enum validation
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_severity_check"
  CHECK ("severity" IN ('info', 'success', 'warning', 'error'));

-- Delivery status enum validation
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_delivery_status_check"
  CHECK ("delivery_status" IN ('pending', 'delivered', 'failed'));

CREATE INDEX IF NOT EXISTS "notifications_organization_id_user_id_read_at_idx"
  ON "notifications" ("organization_id", "user_id", "read_at");

CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx"
  ON "notifications" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_organization_id_type_idx"
  ON "notifications" ("organization_id", "type");

CREATE INDEX IF NOT EXISTS "notifications_scheduled_for_idx"
  ON "notifications" ("scheduled_for");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 2. notification_preferences table ────────────────────────────────
CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id"                TEXT NOT NULL,
    "organization_id"   TEXT NOT NULL,
    "user_id"           TEXT NOT NULL,
    "in_app_enabled"    BOOLEAN NOT NULL DEFAULT true,
    "email_enabled"     BOOLEAN NOT NULL DEFAULT false,
    "enabled_types"    JSONB,
    "digest_frequency" TEXT NOT NULL DEFAULT 'instant',
    "quiet_hours"       JSONB,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- Digest frequency enum validation
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_digest_frequency_check"
  CHECK ("digest_frequency" IN ('instant', 'hourly', 'daily', 'weekly'));

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_key"
  ON "notification_preferences" ("user_id");

CREATE INDEX IF NOT EXISTS "notification_preferences_organization_id_idx"
  ON "notification_preferences" ("organization_id");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

-- ─── 3. RLS activation on both new tables ─────────────────────────────
DO $$
DECLARE
  t TEXT;
  new_tables TEXT[] := ARRAY['notifications', 'notification_preferences'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── 4. Tenant isolation policies ─────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON "notifications";
CREATE POLICY "tenant_isolation" ON "notifications"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "notification_preferences";
CREATE POLICY "tenant_isolation" ON "notification_preferences"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true))
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true));
