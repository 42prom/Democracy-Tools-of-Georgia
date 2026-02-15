#!/bin/bash
# =============================================================================
# DTG Cleanup Script - Remove Redundant/Debug Files
# =============================================================================
# Run this script to clean up temporary debug files and test artifacts.
# Review the list before running!
# =============================================================================

set -e

echo "DTG Cleanup Script"
echo "=================="
echo ""

# Backend debug scripts (one-off diagnostic tools)
BACKEND_DEBUG_SCRIPTS=(
    "backend/trace_message_delivery.ts"
    "backend/list_all_users.ts"
    "backend/check_user_hash.ts"
    "backend/check_eligibility_by_id.ts"
    "backend/test_auth_manual.ts"
    "backend/verify_settings_e2e.ts"
    "backend/verify_full_settings_suite.ts"
    "backend/list_security_keys.ts"
    "backend/query_events.ts"
    "backend/query_settings.ts"
    "backend/run_rename_migration.ts"
    "backend/query_last_10m.ts"
    "backend/query_biometric_data.ts"
    "backend/query_detailed_settings.ts"
)

# Backend debug output files
BACKEND_DEBUG_OUTPUT=(
    "backend/debug_output.txt"
    "backend/settings_output.txt"
    "backend/events_output.txt"
    "backend/debug_settings.txt"
    "backend/current_settings.txt"
    "backend/detailed_events.txt"
    "backend/verification_result.txt"
    "backend/full_verification_result.txt"
    "backend/keys.txt"
)

# Admin temp files
ADMIN_TEMP=(
    "admin/vite.config.ts.bak"
    "admin/test_results.txt"
    "admin/test_error_detail.txt"
    "admin/full_error.txt"
    "admin/full_stderr.txt"
)

# Mobile temp files
MOBILE_TEMP=(
    "mobile/flutter_analyze_output.txt"
    "mobile/analyzed.txt"
)

# Root level noise files
ROOT_NOISE=(
    "AGENTS_Flutter.md"
    "prefinal_tasks.md"
    "restore_docker.md"
)

echo "Files to be removed:"
echo ""

echo "=== Backend Debug Scripts ==="
for f in "${BACKEND_DEBUG_SCRIPTS[@]}"; do
    if [ -f "$f" ]; then
        echo "  $f"
    fi
done

echo ""
echo "=== Backend Debug Output ==="
for f in "${BACKEND_DEBUG_OUTPUT[@]}"; do
    if [ -f "$f" ]; then
        echo "  $f"
    fi
done

echo ""
echo "=== Admin Temp Files ==="
for f in "${ADMIN_TEMP[@]}"; do
    if [ -f "$f" ]; then
        echo "  $f"
    fi
done

echo ""
echo "=== Mobile Temp Files ==="
for f in "${MOBILE_TEMP[@]}"; do
    if [ -f "$f" ]; then
        echo "  $f"
    fi
done

echo ""
read -p "Delete these files? (y/N): " confirm

if [[ "$confirm" =~ ^[Yy]$ ]]; then
    for f in "${BACKEND_DEBUG_SCRIPTS[@]}" "${BACKEND_DEBUG_OUTPUT[@]}" "${ADMIN_TEMP[@]}" "${MOBILE_TEMP[@]}"; do
        if [ -f "$f" ]; then
            rm -f "$f"
            echo "Deleted: $f"
        fi
    done
    echo ""
    echo "Cleanup complete!"
else
    echo "Cleanup cancelled."
fi
