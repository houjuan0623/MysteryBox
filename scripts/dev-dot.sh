#!/usr/bin/env bash
set -euo pipefail
if ! command -v npm >/dev/null 2>&1; then source /workspace/shared/runtimes/activate.sh; fi
cd "$(dirname "$0")/.."
exec npm run dev
