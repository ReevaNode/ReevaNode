#!/usr/bin/env bash
set -euo pipefail

TARGET="${SMOKE_URL:-http://localhost:3001}/health"
echo "Running smoke test against ${TARGET}"
curl -sf "$TARGET" | grep -i "healthy"
