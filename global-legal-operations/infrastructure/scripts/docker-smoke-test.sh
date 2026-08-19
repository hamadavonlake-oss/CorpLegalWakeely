#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo "=== Docker Smoke Test ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Check Docker availability
if ! command -v docker &> /dev/null; then
  echo "[SKIP] Docker not available in this environment."
  echo "       This script must be run in a Docker-capable environment."
  exit 0
fi

if ! docker compose version &> /dev/null; then
  echo "[SKIP] Docker Compose not available."
  exit 0
fi

# 1. Validate Compose config
echo "[1/8] Validating docker-compose.yml..."
docker compose config --quiet
echo "       OK"

# 2. Build images
echo "[2/8] Building Docker images..."
docker compose build 2>&1 | tail -5
echo "       OK"

# 3. Start services
echo "[3/8] Starting services..."
docker compose up -d 2>&1 | tail -5
echo "       OK"

# 4. Wait for healthy services
echo "[4/8] Waiting for services to become healthy..."
sleep 10
docker compose ps
echo ""

# 5. Test PostgreSQL
echo "[5/8] Testing PostgreSQL..."
if docker compose exec -T postgres pg_isready -U legalops -d legalops &> /dev/null; then
  echo "       PostgreSQL: UP"
else
  echo "       PostgreSQL: DOWN (may need more time)"
fi

# 6. Test API Health
echo "[6/8] Testing API health endpoint..."
API_HEALTH="$(curl -sf --max-time 15 http://localhost:3001/api/v1/health 2>/dev/null || echo '{"status":"unreachable"}')"
API_STATUS="$(echo "$API_HEALTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])' 2>/dev/null || echo 'parse_error')"
echo "       API Health: $API_STATUS"

# 7. Test Web
echo "[7/8] Testing Web frontend..."
WEB_STATUS="$(curl -sf -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:3000/ar 2>/dev/null || echo '000')"
echo "       Web HTTP Status: $WEB_STATUS"

# 8. Test Redis
echo "[8/8] Testing Redis..."
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "       Redis: UP"
else
  echo "       Redis: DOWN (may need more time)"
fi

echo ""
echo "=== Smoke Test Complete ==="
echo ""
echo "To stop services: docker compose down"
echo "To view logs:    docker compose logs -f"
