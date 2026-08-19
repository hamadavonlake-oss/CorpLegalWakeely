#!/bin/bash
set -euo pipefail

echo "=== Seeding Database ==="
npx tsx prisma/seed/index.ts
echo "[OK] Seed complete"
