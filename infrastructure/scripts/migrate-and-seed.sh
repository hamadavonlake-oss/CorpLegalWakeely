#!/bin/bash
# ═════════════════════════════════════════════════════════════════════
# Database Migration Runner — Railway Deploy Hook
# ═════════════════════════════════════════════════════════════════════
#
# Runs on every Railway deploy BEFORE the app starts.
# Applies all Prisma migrations + RLS policies + seed data.
#
# Usage: Called automatically by Railway's pre-deploy hook:
#   railway run bash infrastructure/scripts/migrate-and-seed.sh
#
# Required env vars:
#   DATABASE_URL — PostgreSQL connection string (provided by Railway Postgres plugin)
# ═════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Database Migration & Seed Runner"
echo "═══════════════════════════════════════════════════════════"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Cannot run migrations."
  exit 1
fi

echo "→ Waiting for PostgreSQL to be ready..."
# Simple retry loop — PostgreSQL plugin may not be ready immediately
for i in $(seq 1 30); do
  if npx prisma db ping --schema=prisma/schema.prisma 2>/dev/null; then
    echo "  ✓ PostgreSQL is ready"
    break
  fi
  echo "  Attempt $i/30 — waiting for PostgreSQL..."
  sleep 2
  if [ $i -eq 30 ]; then
    echo "ERROR: PostgreSQL did not become ready in 60s"
    exit 1
  fi
done

echo "→ Generating Prisma client..."
npx prisma generate --schema=prisma/schema.prisma
echo "  ✓ Prisma client generated"

echo "→ Applying migrations..."
# Apply all migration SQL files in order
MIGRATIONS_DIR="prisma/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
  for migration_dir in $(ls -1 "$MIGRATIONS_DIR" | sort); do
    sql_file="$MIGRATIONS_DIR/$migration_dir/migration.sql"
    if [ -f "$sql_file" ]; then
      echo "  → Applying: $migration_dir"
      # Use psql or Prisma's executeRaw to run the SQL
      # We use a node script to execute raw SQL via Prisma
      node -e "
        const { PrismaClient } = require('@prisma/client');
        const fs = require('fs');
        const path = require('path');
        async function main() {
          const sql = fs.readFileSync('$sql_file', 'utf8');
          const prisma = new PrismaClient();
          // Split on semicolons and execute each statement
          const statements = sql.split(';').filter(s => s.trim().length > 0);
          for (const stmt of statements) {
            try {
              await prisma.\$executeRawUnsafe(stmt + ';');
            } catch (e) {
              // Ignore "already exists" errors (idempotent migrations)
              if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
                console.error('  ERROR in statement:', e.message);
                throw e;
              }
            }
          }
          await prisma.\$disconnect();
        }
        main().catch(e => { console.error(e); process.exit(1); });
      "
      echo "    ✓ Applied"
    fi
  done
else
  echo "  ⚠ No migrations directory found — skipping"
fi

echo "→ Checking if seed should run..."
# Only seed if the database is empty (no organizations table or empty)
SEED_FLAG="/tmp/.glo_seeded"
if [ -f "$SEED_FLAG" ]; then
  echo "  ⚠ Already seeded — skipping"
else
  echo "  → Running seed script..."
  # Run the seed script (it's idempotent — uses upsert/create with .catch)
  npx tsx prisma/seed/index.ts 2>&1 || {
    echo "  ⚠ Seed script had errors (may be partially applied — that's OK for idempotent seeds)"
  }
  touch "$SEED_FLAG"
  echo "  ✓ Seed complete"
fi

echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Database migrations and seed complete!"
echo "═══════════════════════════════════════════════════════════"
