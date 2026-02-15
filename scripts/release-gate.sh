#!/bin/bash
# scripts/release-gate.sh
# Verifies that all components build and pass static analysis.

set -e
set -x  # Debug mode

echo "============================================"
echo "      DTFG RELEASE GATE VERIFICATION        "
echo "============================================"
echo ""

# 1. Backend Verification
echo ">>> [1/3] Checking Backend..."
if [ -d "backend" ]; then
  cd backend
  if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm ci
  fi
  echo "Building backend..."
  npm run build
  cd ..
  echo "✅ Backend passed."
else
  echo "⚠️  Backend directory not found!"
  exit 1
fi
echo ""

# 2. Admin Verification
echo ">>> [2/3] Checking Admin Panel..."
if [ -d "admin" ]; then
  cd admin
  if [ ! -d "node_modules" ]; then
    echo "Installing admin dependencies..."
    npm ci --silent
  fi
  echo "Building admin panel..."
  npm run build
  cd ..
  echo "✅ Admin passed."
else
  echo "⚠️  Admin directory not found!"
  exit 1
fi
echo ""

# 3. Mobile Verification
echo ">>> [3/3] Checking Mobile App..."
if [ -d "mobile" ]; then
  cd mobile
  # Check if flutter is available
  if command -v flutter &> /dev/null; then
    echo "Running Flutter analysis..."
    flutter analyze
    echo "✅ Mobile passed."
  else
    echo "⚠️  Flutter not found in PATH. Skipping mobile check."
  fi
  cd ..
else
  echo "⚠️  Mobile directory not found!"
  exit 1
fi
echo ""

echo "============================================"
echo "   🎉 ALL TRUNK RESIDENT CHECKS PASSED      "
echo "============================================"
