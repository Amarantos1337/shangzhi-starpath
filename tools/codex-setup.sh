#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--browser" ) ]]; then
  echo 'Usage: bash tools/codex-setup.sh [--browser]' >&2
  exit 1
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22+ required (24 LTS recommended)"); process.exit(1); }'
node tools/dev.js test

if [[ "${1:-}" == "--browser" ]]; then
  npm install --prefix .codex-tools --no-save --package-lock=false playwright
  node .codex-tools/node_modules/playwright/cli.js install --with-deps chromium
fi

echo 'Ready. Preview: node tools/dev.js serve --host 0.0.0.0 --port 8765'
