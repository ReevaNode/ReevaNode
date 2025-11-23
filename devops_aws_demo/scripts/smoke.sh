#!/usr/bin/env bash
set -euo pipefail
curl -sf "$SMOKE_URL/health" | grep -i "ok"
