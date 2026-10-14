#!/usr/bin/env bash
# 从保留源文本重建。默认门禁关闭；用户亲自在可信终端输入新密钥，不写环境文件。
set +x
set -euo pipefail
umask 077
unset AI_GATEWAY_API_KEY OPENAI_API_KEY
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if ! command -v npm >/dev/null 2>&1; then
  if [[ -f /workspace/shared/runtimes/activate.sh ]]; then
    source /workspace/shared/runtimes/activate.sh
  else
    printf '%s\n' 'Node.js 24 and npm must already be installed. Nothing was sent.' >&2
    exit 1
  fi
fi
node --import tsx scripts/live-smoke.ts --preflight
if [[ "${1:-}" != '' && "${1:-}" != '--service' ]]; then
  printf '%s\n' 'Usage: bash scripts/live-smoke.sh [--service]' >&2
  exit 1
fi
if [[ ! -t 0 ]]; then
  printf '%s\n' 'Use an interactive trusted terminal; do not pipe a key or place it in a command.' >&2
  exit 1
fi
if [[ "${1:-}" != '--service' ]]; then npm run build -w @mysterybox/api; fi
api_pid=''
web_pid=''
cleanup() {
  unset AI_GATEWAY_API_KEY
  [[ -z "$web_pid" ]] || kill "$web_pid" 2>/dev/null || true
  [[ -z "$api_pid" ]] || kill "$api_pid" 2>/dev/null || true
  [[ -z "$api_pid" ]] || wait "$api_pid" 2>/dev/null || true
  [[ -z "$web_pid" ]] || wait "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'printf "\nCancelled.\n" >&2; exit 130' INT TERM
unset AI_GATEWAY_API_KEY
printf '%s' 'Enter a NEW Vercel AI Gateway key (input hidden; press Enter to submit): ' >&2
IFS= read -r -s AI_GATEWAY_API_KEY
printf '\n' >&2
if [[ -z "$AI_GATEWAY_API_KEY" ]]; then printf '%s\n' 'No key entered. Nothing was sent.' >&2; exit 1; fi
export AI_GATEWAY_API_KEY
export AI_MODE=vercel PAYMENT_MODE=demo EMAIL_MODE=demo AI_GATEWAY_MODEL=openai/gpt-5.4-mini
if [[ "${1:-}" == '--service' ]]; then
  node --import tsx scripts/live-smoke.ts
else
  export APP_LIVE_TEST=1 NODE_ENV=development APP_URL=http://localhost:3000 PORT=4000 FREE_DAILY_LIMIT=20 MONGODB_URI='' MONGODB_DB=mysterybox_live_smoke
  node apps/api/dist/apps/api/src/main.js &
  api_pid=$!
  unset AI_GATEWAY_API_KEY
  env -u AI_GATEWAY_API_KEY -u OPENAI_API_KEY -u APP_LIVE_TEST node node_modules/next/dist/bin/next dev apps/web --hostname 127.0.0.1 --port 3000 &
  web_pid=$!
  printf '%s\n' 'Guarded API and web are starting. Open http://localhost:3000 for the authorized synthetic UI test. Press Ctrl-C here to stop both.'
  while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do sleep 1; done
  printf '%s\n' 'A test server stopped; shutting down both. Check the sanitized terminal status before retrying.' >&2
  exit 1
fi
