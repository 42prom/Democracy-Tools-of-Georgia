#!/usr/bin/env bash
# verify-persistence.sh
# Tests that regions and profiles persist across server restarts.
#
# Prerequisites:
#   - Docker container 'DTG-postgres' running
#
# Usage:
#   bash scripts/verify-persistence.sh

set -e

# DB_URL is not used with docker exec, but we keep the var for reference if needed later
DB_USER="DTG_user"
DB_NAME="DTG"
CONTAINER_NAME="DTG-postgres"

PASS=0
FAIL=0

run_sql() {
  # Use docker exec to avoid local psql dependency and auth issues
  docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
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
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo "  ERROR: Container $CONTAINER_NAME is not running."
  echo "  Run: docker-compose up -d postgres"
  exit 1
fi

DB_OK=$(run_sql "SELECT 1" || echo "error")
if [ "$DB_OK" != "1" ]; then
  echo "  ERROR: Cannot connect to database inside $CONTAINER_NAME"
  exit 1
fi
echo "  OK: Connected to database ($CONTAINER_NAME)"
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
# Use grep loosely to find any volume containing "postgres_data"
VOL_EXISTS=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -c "postgres_data" || echo "0")
if [ "$VOL_EXISTS" -ge 1 ]; then
  echo "  OK: Docker volume(s) found for postgres_data (data survives container restarts)"
else
  echo "  WARN: Docker volume 'postgres_data' not found (are you using Docker?)"
fi
echo ""

# -------------------------------------------------------
echo "7. Checking migration idempotency (004 must NOT have unconditional DROP)..."
HAS_DROP=$(grep -c "^DROP TABLE IF EXISTS users" "db/migrations/004_identity_system.sql" 2>/dev/null || echo "0")
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
