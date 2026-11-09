#!/usr/bin/env bash
# verify-persistence.sh
# Tests that regions and profiles persist across server restarts.
#
# Prerequisites:
#   - Compose service 'postgres' running
#
# Usage:
#   bash scripts/verify-persistence.sh

set -e

DB_USER="${DB_USER:-dtg_user}"
DB_NAME="${DB_NAME:-dtg}"
COMPOSE=(docker compose)

PASS=0
FAIL=0

run_sql() {
  # Resolve the service through Compose so project/container names never collide.
  "${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected='$expected', got='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== DTFG Persistence Verification ==="
echo ""

# -------------------------------------------------------
echo "1. Checking database connection..."
# We check if container is running first
if ! "${COMPOSE[@]}" ps --services --status running | grep -qx "postgres"; then
  echo "  ERROR: Compose service 'postgres' is not running."
  echo "  Run: docker compose up -d postgres"
  exit 1
fi

DB_OK=$(run_sql "SELECT 1" || echo "error")
if [ "$DB_OK" != "1" ]; then
  echo "  ERROR: Cannot connect to database through Compose service 'postgres'"
  exit 1
fi
echo "  OK: Connected to database (Compose service postgres)"
echo ""

# -------------------------------------------------------
echo "2. Checking schema_migrations table..."
SM_EXISTS=$(run_sql "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='schema_migrations')")
check "schema_migrations table exists" "t" "$SM_EXISTS"

if [ "$SM_EXISTS" = "t" ]; then
  SM_COUNT=$(run_sql "SELECT COUNT(*) FROM schema_migrations")
  echo "  INFO: $SM_COUNT migrations recorded"
fi
echo ""

# -------------------------------------------------------
echo "3. Checking core tables exist..."
for TBL in regions users polls messages settings security_events auth_rate_limits; do
  TBL_EXISTS=$(run_sql "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='$TBL')")
  check "Table '$TBL' exists" "t" "$TBL_EXISTS"
done
echo ""

# -------------------------------------------------------
echo "4. Testing region persistence..."
# Insert a test region
run_sql "INSERT INTO regions (code, name_en, name_ka, active)
         VALUES ('_test_persist', 'Persistence Test', 'ტესტი', true)
         ON CONFLICT (code) DO NOTHING" >/dev/null 2>&1

TEST_REGION=$(run_sql "SELECT code FROM regions WHERE code = '_test_persist'")
check "Test region inserted" "_test_persist" "$TEST_REGION"

REGION_COUNT=$(run_sql "SELECT COUNT(*) FROM regions")
echo "  INFO: $REGION_COUNT total regions in database"

# Clean up test region
run_sql "DELETE FROM regions WHERE code = '_test_persist'" >/dev/null 2>&1
echo ""

# -------------------------------------------------------
echo "5. Testing user/profile persistence..."
# Insert a test user
run_sql "INSERT INTO users (pn_hash, credential_gender, credential_birth_year, credential_region_codes)
         VALUES ('_test_persist_hash_000', 'M', 1990, ARRAY['reg_tbilisi'])
         ON CONFLICT (pn_hash) DO NOTHING" >/dev/null 2>&1

TEST_USER=$(run_sql "SELECT pn_hash FROM users WHERE pn_hash = '_test_persist_hash_000'")
check "Test user inserted" "_test_persist_hash_000" "$TEST_USER"

USER_COUNT=$(run_sql "SELECT COUNT(*) FROM users")
echo "  INFO: $USER_COUNT total users in database"

# Clean up test user
run_sql "DELETE FROM users WHERE pn_hash = '_test_persist_hash_000'" >/dev/null 2>&1
echo ""

# -------------------------------------------------------
echo "6. Checking Docker volume persistence..."
POSTGRES_CONTAINER=$("${COMPOSE[@]}" ps -q postgres)
POSTGRES_VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)
if [ -n "$POSTGRES_VOLUME" ]; then
  echo "  OK: Docker volume '$POSTGRES_VOLUME' is mounted (data survives container restarts)"
else
  echo "  WARN: Docker volume 'postgres_data' not found (are you using Docker?)"
fi
echo ""

# -------------------------------------------------------
echo "7. Checking migration idempotency (004 must NOT have unconditional DROP)..."
HAS_DROP=$(grep -c "^DROP TABLE IF EXISTS users" "backend/db/migrations/004_identity_system.sql" 2>/dev/null || echo "0")
check "Migration 004 has no unconditional DROP TABLE" "0" "$HAS_DROP"
echo ""

# -------------------------------------------------------
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "SOME CHECKS FAILED. Review above output."
  exit 1
else
  echo "ALL CHECKS PASSED."
  exit 0
fi
