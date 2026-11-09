#!/usr/bin/env bash
# Deterministic local/CI release gate. Set SKIP_MOBILE=1 only for the
# explicitly scoped admin/backend gate; a full release never skips mobile.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

run_node_gate() {
  local component="$1"
  pushd "$component" >/dev/null
  if [[ ! -d node_modules ]]; then
    npm ci --ignore-scripts
  fi
  npm audit --omit=dev --audit-level=high
  npm run lint
  npx tsc --noEmit
  if [[ "$component" == "backend" ]]; then
    npm test -- --runInBand
  else
    npm test
  fi
  npm run build
  popd >/dev/null
}

echo "[1/4] Backend security, tests, and build"
run_node_gate backend

echo "[2/4] Admin security, tests, and build"
run_node_gate admin

echo "[3/4] Docker Compose validation"
docker compose --env-file .env.example config --quiet

echo "[4/4] Mobile static and unit tests"
if [[ "${SKIP_MOBILE:-0}" == "1" ]]; then
  echo "Mobile gate explicitly skipped (admin/backend scope only)."
else
  if ! command -v flutter >/dev/null 2>&1; then
    echo "Flutter is required for a full release gate." >&2
    exit 1
  fi
  pushd mobile >/dev/null
  flutter pub get
  dart analyze lib test integration_test
  flutter test --reporter compact
  popd >/dev/null
fi

echo "Release gate passed."
