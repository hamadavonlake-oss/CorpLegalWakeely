#!/bin/bash
set -euo pipefail

SHARED_DIR="/home/z/my-project/global-legal-operations/packages/shared"
mkdir -p "$SHARED_DIR/src/types" "$SHARED_DIR/src/enums" "$SHARED_DIR/src/constants" "$SHARED_DIR/src/utils"

# Write the index barrel
cp /home/z/my-project/scripts/phase0-shared-index.ts "$SHARED_DIR/src/index.ts"

echo "=== shared package complete ==="