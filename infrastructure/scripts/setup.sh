#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "=== Global Legal Operations Platform - Setup ==="
echo "Project root: $PROJECT_ROOT"

# 1. Copy env if not exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  echo "[OK] .env created from .env.example - PLEASE REVIEW AND UPDATE SECRETS"
else
  echo "[SKIP] .env already exists"
fi

# 2. Generate JWT keys if not exist
KEYS_DIR="$PROJECT_ROOT/keys"
mkdir -p "$KEYS_DIR"
if [ ! -f "$KEYS_DIR/private.pem" ] || [ ! -f "$KEYS_DIR/public.pem" ]; then
  openssl genrsa -out "$KEYS_DIR/private.pem" 4096
  openssl rsa -in "$KEYS_DIR/private.pem" -pubout -out "$KEYS_DIR/public.pem"
  echo "[OK] JWT RSA keys generated in keys/"
else
  echo "[SKIP] JWT keys already exist"
fi

# 3. Install dependencies
echo "[...] Installing dependencies..."
cd "$PROJECT_ROOT"
npm install
echo "[OK] Dependencies installed"

# 4. Generate Prisma client
echo "[...] Generating Prisma client..."
npx prisma generate --schema=prisma/schema.prisma
echo "[OK] Prisma client generated"

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "  1. Start services: docker compose up -d"
echo "  2. Run migrations: npm run db:migrate"
echo "  3. Seed data: npm run db:seed"
echo "  4. Start dev: npm run dev"
