#!/usr/bin/env bash
# =============================================================================
# DTG Security Audit Script
# =============================================================================
# Runs dependency vulnerability scans across all components of the platform.
# Integrate this into CI/CD to catch CVEs before they reach production.
#
# Usage:
#   chmod +x scripts/security-audit.sh
#   ./scripts/security-audit.sh
#
# Exit code: 0 = clean, 1 = vulnerabilities found
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

AUDIT_FAILED=0
REPORT_DIR="./security-audit-reports"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
REPORT_FILE="$REPORT_DIR/audit_$TIMESTAMP.txt"

mkdir -p "$REPORT_DIR"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DTG Platform — Security Dependency Audit       ║${NC}"
echo -e "${BLUE}║   $(date)                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo "" | tee "$REPORT_FILE"

# =============================================================================
# 1. Backend (Node.js)
# =============================================================================

echo -e "${YELLOW}▶ Scanning: backend (Node.js / npm)${NC}" | tee -a "$REPORT_FILE"
if [ -d "./backend" ]; then
  cd backend

  # Run audit and capture output + exit code
  if npm audit --audit-level=moderate --json > "$OLDPWD/$REPORT_DIR/backend_audit.json" 2>&1; then
    echo -e "  ${GREEN}✓ No moderate+ vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
  else
    VULN_COUNT=$(node -e "try{const r=require('./$REPORT_DIR/backend_audit.json');console.log(r.metadata?.vulnerabilities?.moderate+r.metadata?.vulnerabilities?.high+r.metadata?.vulnerabilities?.critical||'?')}catch(e){console.log('?')}" 2>/dev/null || echo "?")
    echo -e "  ${RED}✗ Vulnerabilities found (moderate+: ~${VULN_COUNT})${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
    echo -e "  ${YELLOW}  → Run: cd backend && npm audit fix${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
    AUDIT_FAILED=1
  fi

  cd ..
else
  echo -e "  ${YELLOW}⚠ backend/ directory not found — skipping${NC}" | tee -a "$REPORT_FILE"
fi

echo ""

# =============================================================================
# 2. Admin Panel (Node.js)
# =============================================================================

echo -e "${YELLOW}▶ Scanning: admin panel (Node.js / npm)${NC}" | tee -a "$REPORT_FILE"
if [ -d "./admin" ]; then
  cd admin

  if npm audit --audit-level=moderate --json > "$OLDPWD/$REPORT_DIR/admin_audit.json" 2>&1; then
    echo -e "  ${GREEN}✓ No moderate+ vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
  else
    echo -e "  ${RED}✗ Vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
    echo -e "  ${YELLOW}  → Run: cd admin && npm audit fix${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
    AUDIT_FAILED=1
  fi

  cd ..
else
  echo -e "  ${YELLOW}⚠ admin/ directory not found — skipping${NC}" | tee -a "$REPORT_FILE"
fi

echo ""

# =============================================================================
# 3. DTG Shield Service (Python)
# =============================================================================

echo -e "${YELLOW}▶ Scanning: dtg-shield-service (Python / pip-audit)${NC}" | tee -a "$REPORT_FILE"
if [ -d "./dtg-shield-service" ]; then
  if command -v pip-audit &> /dev/null; then
    cd dtg-shield-service

    if pip-audit -r requirements.txt --format json -o "$OLDPWD/$REPORT_DIR/shield_audit.json" 2>&1; then
      echo -e "  ${GREEN}✓ No vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
    else
      echo -e "  ${RED}✗ Vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
      echo -e "  ${YELLOW}  → Run: cd dtg-shield-service && pip-audit -r requirements.txt --fix${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
      AUDIT_FAILED=1
    fi

    cd ..
  else
    echo -e "  ${YELLOW}⚠ pip-audit not installed. Install: pip install pip-audit${NC}" | tee -a "$REPORT_FILE"
  fi
else
  echo -e "  ${YELLOW}⚠ dtg-shield-service/ directory not found — skipping${NC}" | tee -a "$REPORT_FILE"
fi

echo ""

# =============================================================================
# 4. Biometric Service (Python) — if exists
# =============================================================================

echo -e "${YELLOW}▶ Scanning: biometric-service (Python / pip-audit)${NC}" | tee -a "$REPORT_FILE"
if [ -d "./biometric-service" ] && command -v pip-audit &> /dev/null; then
  cd biometric-service

  REQS_FILE="requirements.txt"
  [ ! -f "$REQS_FILE" ] && REQS_FILE="requirements-lock.txt"

  if [ -f "$REQS_FILE" ]; then
    if pip-audit -r "$REQS_FILE" --format json -o "$OLDPWD/$REPORT_DIR/biometric_audit.json" 2>&1; then
      echo -e "  ${GREEN}✓ No vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
    else
      echo -e "  ${RED}✗ Vulnerabilities found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
      AUDIT_FAILED=1
    fi
  else
    echo -e "  ${YELLOW}⚠ No requirements file found${NC}" | tee -a "$OLDPWD/$REPORT_FILE"
  fi

  cd ..
else
  echo -e "  ${YELLOW}⚠ biometric-service/ not found or pip-audit missing — skipping${NC}" | tee -a "$REPORT_FILE"
fi

echo ""

# =============================================================================
# 5. Summary
# =============================================================================

echo -e "${BLUE}══════════════════════════════════════════════════${NC}" | tee -a "$REPORT_FILE"
if [ $AUDIT_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CLEAR — No critical or moderate vulnerabilities found.${NC}" | tee -a "$REPORT_FILE"
  echo -e "${GREEN}   Full report saved to: $REPORT_FILE${NC}"
else
  echo -e "${RED}❌ VULNERABILITIES DETECTED — Review the reports above.${NC}" | tee -a "$REPORT_FILE"
  echo -e "${YELLOW}   Reports saved to: $REPORT_DIR/${NC}"
  echo -e "${YELLOW}   Fix with: npm audit fix (Node.js) | pip-audit --fix (Python)${NC}"
fi
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo ""

exit $AUDIT_FAILED
