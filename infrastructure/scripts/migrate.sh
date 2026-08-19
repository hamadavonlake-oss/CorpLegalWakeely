#!/bin/bash
set -euo pipefail

echo "=== Running Database Migrations ==="
npx prisma migrate deploy --schema=prisma/schema.prisma
echo "[OK] Migrations complete"
