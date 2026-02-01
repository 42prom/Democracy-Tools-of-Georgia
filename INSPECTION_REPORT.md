# 🔍 CODEBASE INSPECTION REPORT
**Date**: 2026-01-30
**Scope**: Mobile, Admin UI, Backend

---

## 📱 MOBILE APP INSPECTION

### 1. Admin Login/Routes/Screens/Deep Links
**Status**: ❌ **NOT IMPLEMENTED**

**Findings**:
- ✅ No admin-related code found in mobile app (searched all `.dart` files)
- ✅ No deep links configured
- ✅ No admin API usage
- ✅ Mobile is strictly for citizen voting only

**Files Checked**:
- `mobile/lib/**/*.dart` - No matches for "admin"

---

### 2. Footer Logic - Step 1 & Step 2 Behavior
**Status**: ✅ **CORRECTLY IMPLEMENTED**

**Findings**:
- ✅ **Enrollment screens (Steps 1-3) have NO footer**
- ✅ **Dashboard screen has footer (appears after enrollment)**

**Implementation Details**:

| Screen | File | Has BottomNavigationBar? | ✓/✗ |
|--------|------|--------------------------|-----|
| **Step 1.1: Intro** | `mobile/lib/screens/enrollment/intro_screen.dart` | ❌ NO | ✅ |
| **Step 1.2: NFC Scan** | `mobile/lib/screens/enrollment/nfc_scan_screen.dart` | ❌ NO | ✅ |
| **Step 1.3: Liveness** | `mobile/lib/screens/enrollment/liveness_screen.dart` | ❌ NO | ✅ |
| **Dashboard** | `mobile/lib/screens/dashboard/dashboard_screen.dart` | ✅ YES | ✅ |

**Code Evidence**:
```dart
// intro_screen.dart (Line 9-58)
return Scaffold(
  body: SafeArea(
    // ...
  ),
  // NO bottomNavigationBar
);

// dashboard_screen.dart (Line 60-65)
return Scaffold(
  appBar: AppBar(...),
  body: _buildBody(),
  bottomNavigationBar: BottomNav(  // ✅ Footer appears here
    currentIndex: _currentIndex,
    onTap: (index) { ... },
  ),
);
```

**Footer Trigger Logic**:
```dart
// main.dart (Line 50-72) - SplashScreen._checkEnrollment()
final isEnrolled = await _storageService.isEnrolled();

if (isEnrolled) {
  Navigator.of(context).pushReplacement(
    MaterialPageRoute(
      builder: (context) => const DashboardScreen(), // ✅ Has footer
    ),
  );
} else {
  Navigator.of(context).pushReplacement(
    MaterialPageRoute(
      builder: (context) => const IntroScreen(), // ❌ NO footer
    ),
  );
}
```

**State Management**:
- `StorageService.isEnrolled()` → stored in SharedPreferences
- Set to `true` after liveness check completes (`liveness_screen.dart:91`)

---

### 3. Mobile Wallet Features
**Status**: ⚠️ **PARTIALLY IMPLEMENTED**

**File**: `mobile/lib/screens/wallet/wallet_screen.dart`

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Balance Display** | ✅ Implemented | Shows "0.00 DTFG" + USD equivalent (Line 40-52) |
| **Receive QR** | ✅ Implemented | QR dialog with wallet address (Line 147-180) |
| **Send** | ❌ Stub | Shows "Coming soon in Phase 1" (Line 182-186) |
| **Scan** | ❌ Stub | Shows "Coming soon in Phase 1" (Line 182-186) |
| **Transaction History** | ⚠️ Empty State | Shows "No transactions yet" (Line 99-119) |
| **Unlock/Security** | ❌ Not implemented | No biometric unlock for wallet |

**Missing Features**:
1. ❌ Send tokens functionality
2. ❌ QR code scanning for payments
3. ❌ Real transaction history (needs blockchain integration)
4. ❌ Wallet unlock/lock with biometrics
5. ❌ Token balance fetching from backend
6. ❌ Gas estimation
7. ❌ Transaction signing

**Working Features**:
- ✅ Balance card UI (mock data)
- ✅ QR code generation for receiving (`qr_flutter` package)
- ✅ Action buttons (Send/Receive/Scan)
- ✅ Empty state for transaction history

---

## 🖥️ ADMIN UI INSPECTION

### 4. Polls Not Saving Issue
**Status**: ⚠️ **API ENDPOINT MISMATCH**

**Root Cause**: Estimate endpoint path mismatch

**Admin Client** (`admin/src/api/client.ts:34-36`):
```typescript
estimate: async (rules: AudienceRules): Promise<AudienceEstimate> => {
  const response = await apiClient.post('/admin/polls/estimate', { rules });
  //                                     ^^^^^^^^^^^^^^^^^^^^^ NO poll ID
  return response.data;
},
```

**Backend Route** (`server/src/routes/admin/polls.ts:56-61`):
```typescript
// POST /api/v1/admin/polls/:id/estimate
//                          ^^^ REQUIRES poll ID
fastify.post('/:id/estimate', async (request) => {
  const body = EstimateSchema.parse(request.body);
  const estimate = await estimateAudience(body.rules);
  return estimate;
});
```

**Issue**:
- ❌ Admin UI calls `/admin/polls/estimate` (no ID)
- ❌ Backend expects `/admin/polls/:id/estimate` (requires ID)
- ❌ This causes 404 when estimating audience

**Additional Issues**:
1. ⚠️ **Publish endpoint HTTP method mismatch**:
   - Admin client uses `PATCH` (`client.ts:39`)
   - Backend uses `POST` (`polls.ts:64`)

2. ❌ **Missing LIST endpoint**:
   - Admin client calls `GET /admin/polls` with `?status=` query (`client.ts:44-48`)
   - Backend has NO list endpoint implemented

**Files Involved**:
- `admin/src/api/client.ts` (Line 34-36, 39-48)
- `server/src/routes/admin/polls.ts` (Line 56-76)

---

### 5. Insights Not Working
**Status**: ❌ **NOT IMPLEMENTED**

**Findings**:
- ❌ No `/insights` route in `admin/src/App.tsx`
- ❌ No `Insights.tsx` page exists
- ❌ Sidebar has "Insights" link but goes nowhere

**Layout Navigation** (`admin/src/components/Layout.tsx:25`):
```typescript
{ path: '/insights', label: 'Insights', icon: BarChart3 },
```

**App Routes** (`admin/src/App.tsx:14-24`):
```typescript
<Routes>
  <Route path="/" element={<Layout />}>
    {/* ... other routes ... */}
    {/* ❌ NO /insights route */}
  </Route>
</Routes>
```

**Missing**:
- ❌ `admin/src/pages/Insights.tsx`
- ❌ Route configuration
- ❌ Backend insights API endpoints

---

### 6. Regions Persistence Status
**Status**: ❌ **MOCKED - NOT PERSISTENT**

**Admin Client** (`admin/src/api/client.ts:94-104`):
```typescript
export const regionsApi = {
  list: async (): Promise<Region[]> => {
    // Mock data for Phase 0
    return [
      { id: '1', code: 'reg_tbilisi', name_en: 'Tbilisi', name_ka: 'თბილისი' },
      { id: '2', code: 'reg_batumi', name_en: 'Batumi', name_ka: 'ბათუმი' },
      { id: '3', code: 'reg_kutaisi', name_en: 'Kutaisi', name_ka: 'ქუთაისი' },
      { id: '4', code: 'reg_rustavi', name_en: 'Rustavi', name_ka: 'რუსთავი' },
    ];
  },
};
```

**Database Schema** (`server/migrations/001_init.sql:12-18`):
```sql
CREATE TABLE regions (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    parent_id VARCHAR(20) REFERENCES regions(id),
    active BOOLEAN DEFAULT TRUE
);
```

**Findings**:
- ✅ Database table exists
- ❌ No backend API endpoints for regions CRUD
- ❌ Admin UI uses hardcoded mock data
- ❌ No seed data in migrations

**Missing Backend Endpoints**:
- ❌ `GET /api/v1/admin/regions` (list)
- ❌ `POST /api/v1/admin/regions` (create)
- ❌ `PATCH /api/v1/admin/regions/:id` (update)
- ❌ `DELETE /api/v1/admin/regions/:id` (delete)

---

### 7. Profiles Directory
**Status**: ❌ **DOES NOT EXIST**

**Check Results**:
```bash
find admin/src -type d -name "profiles"
# No results
```

**Missing**:
- ❌ `admin/src/pages/profiles/` directory
- ❌ User profiles page
- ❌ Profile search/filter
- ❌ Profile fields/actions

---

## 🔧 BACKEND INSPECTION

### 8. Nullifier Unique Constraint
**Status**: ✅ **CORRECTLY IMPLEMENTED**

**Database Schema** (`server/migrations/001_init.sql:54-60`):
```sql
CREATE TABLE vote_nullifiers (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier_hash CHAR(64) NOT NULL, -- SHA-256 hex
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (poll_id, nullifier_hash)  -- ✅ COMPOSITE PRIMARY KEY
);
```

**Evidence**:
- ✅ Line 59: `PRIMARY KEY (poll_id, nullifier_hash)`
- ✅ Ensures one vote per nullifier per poll
- ✅ Database-level enforcement (cannot be bypassed)

**How It Works**:
```sql
-- First vote with nullifier "abc123" for poll "poll-1" → SUCCESS
INSERT INTO vote_nullifiers (poll_id, nullifier_hash)
VALUES ('poll-1', 'abc123');

-- Second vote with SAME nullifier for SAME poll → ERROR
INSERT INTO vote_nullifiers (poll_id, nullifier_hash)
VALUES ('poll-1', 'abc123');
-- ERROR: duplicate key value violates unique constraint "vote_nullifiers_pkey"
```

---

### 9. Nonce TTL and Single-Use
**Status**: ⚠️ **SIMPLIFIED IMPLEMENTATION**

**Nonce Service** (`server/src/services/nonce.ts`):

**TTL Implementation** (Line 15):
```typescript
await redisClient.setEx(key, CONFIG.nonce.ttl, '1');
//                           ^^^^^^^^^^^^^^^^ ✅ TTL enforced
```

**Config** (`server/src/config.ts`):
```typescript
nonce: {
  ttl: parseInt(process.env.NONCE_TTL || '120', 10), // ✅ 120 seconds default
}
```

**Single-Use Implementation** (Line 23-42):
```typescript
static async verifyAndConsume(nonce: string, type: 'challenge' | 'vote' = 'challenge'): Promise<boolean> {
  const key = `${NONCE_PREFIX}${type}:${nonce}`;

  // Lua script for atomic get-and-delete
  const luaScript = `
    if redis.call("EXISTS", KEYS[1]) == 1 then
      redis.call("DEL", KEYS[1])  -- ✅ ATOMIC DELETE
      return 1
    else
      return 0
    end
  `;

  const result = await redisClient.eval(luaScript, { keys: [key] }) as number;
  return result === 1;
}
```

**Status Tracking**:
- ⚠️ **Simplified**: No explicit `status` field (used/unused)
- ✅ **Atomic**: Uses Lua script for atomic operations
- ✅ **Single-use**: Deletes nonce on first use
- ✅ **TTL**: Expires after 120 seconds

**Difference from Summary**:
- Summary mentioned status tracking with `unused`/`used` states
- Current implementation just deletes nonce on use (simpler, still correct)

---

### 10. K-Anonymity at Query Time
**Status**: ✅ **CORRECTLY IMPLEMENTED**

**Analytics Service** (`server/src/services/analytics.ts`):

**K-Threshold Constant** (Line 3):
```typescript
const K_THRESHOLD = CONFIG.privacy.minKAnonymity; // ✅ From config (default 30)
```

**Query-Time Enforcement** (Line 92-120):
```typescript
function applyComplementarySuppression(
  cohorts: Array<{ value: string; count: number }>,
  total: number
): Array<{ value: string; count: number | string; percentage?: number }> {
  const nonSuppressed = cohorts.filter(c => c.count >= K_THRESHOLD); // ✅ Filter cells < k
  const suppressed = cohorts.filter(c => c.count < K_THRESHOLD);

  // If only one cell remains after suppression, suppress all
  if (nonSuppressed.length === 1) {
    return cohorts.map(c => ({ value: c.value, count: '<suppressed>' }));
  }

  // Check if suppressed sum can be inferred
  const nonSuppressedSum = nonSuppressed.reduce((sum, c) => sum + c.count, 0);
  const suppressedSum = total - nonSuppressedSum;

  if (suppressedSum < K_THRESHOLD && suppressed.length > 0) {
    // Apply additional suppression to smallest non-suppressed cell
    const sorted = [...nonSuppressed].sort((a, b) => a.count - b.count);
    const toSuppress = new Set([...suppressed.map(c => c.value), sorted[0].value]);
    return cohorts.map(c => ({
      value: c.value,
      count: toSuppress.has(c.value) ? '<suppressed>' : c.count,
      percentage: toSuppress.has(c.value) ? undefined : (c.count / total) * 100,
    }));
  }

  return cohorts.map(c => ({
    value: c.value,
    count: c.count < K_THRESHOLD ? '<suppressed>' : c.count,
    percentage: c.count < K_THRESHOLD ? undefined : (c.count / total) * 100,
  }));
}
```

**Inference Protections** (Line 5-15):
1. ✅ **Cell Suppression**: Cells < k shown as `<suppressed>`
2. ✅ **Complementary Suppression**: Prevents subtraction attacks
3. ✅ **Overlapping Query Prevention**: `validateNoOverlap()` (Line 54-86)
4. ✅ **Minimum Cell Count**: At least 3 non-suppressed cells required
5. ✅ **Query Cache**: Tracks previous queries to detect differencing

**Evidence**:
- ✅ K-anonymity enforced at **query time** (not just publish time)
- ✅ Multiple layers of protection
- ✅ Results never expose cells below threshold

---

## 📊 SUMMARY TABLE

| Component | Feature | Status | File(s) |
|-----------|---------|--------|---------|
| **Mobile** | Admin login/routes | ❌ N/A | None |
| **Mobile** | Footer logic (Step 1-3) | ✅ Correct | `screens/enrollment/*.dart` |
| **Mobile** | Footer appears after enrollment | ✅ Correct | `screens/dashboard/dashboard_screen.dart` |
| **Mobile** | Wallet - Balance display | ✅ Works | `screens/wallet/wallet_screen.dart:40-52` |
| **Mobile** | Wallet - Receive QR | ✅ Works | `screens/wallet/wallet_screen.dart:147-180` |
| **Mobile** | Wallet - Send | ❌ Stub | `screens/wallet/wallet_screen.dart:182` |
| **Mobile** | Wallet - Scan | ❌ Stub | `screens/wallet/wallet_screen.dart:182` |
| **Mobile** | Wallet - History | ⚠️ Empty | `screens/wallet/wallet_screen.dart:99-119` |
| **Mobile** | Wallet - Unlock | ❌ Missing | N/A |
| **Admin** | Polls saving | ⚠️ API mismatch | `api/client.ts:34`, `routes/admin/polls.ts:56` |
| **Admin** | Polls list | ❌ Missing endpoint | `routes/admin/polls.ts` |
| **Admin** | Insights page | ❌ Not implemented | None |
| **Admin** | Regions persistence | ❌ Mocked | `api/client.ts:94` |
| **Admin** | Profiles directory | ❌ Does not exist | None |
| **Backend** | Nullifier unique constraint | ✅ Correct | `migrations/001_init.sql:59` |
| **Backend** | Nonce TTL | ✅ Correct (120s) | `services/nonce.ts:15` |
| **Backend** | Nonce single-use | ✅ Atomic delete | `services/nonce.ts:27-42` |
| **Backend** | K-anon at query time | ✅ Enforced | `services/analytics.ts:92-120` |

---

## 🔧 RECOMMENDED CHUNK ORDER

### **CHUNK 1: Fix Admin Polls API** (High Priority)
**Files**: 3 files
1. `server/src/routes/admin/polls.ts` - Add list endpoint, fix estimate path, fix publish method
2. `server/src/services/polls.ts` - Add listPolls() function
3. Test polls saving and listing

**Why First**: Blocks admin UI from functioning at all

---

### **CHUNK 2: Add Regions Backend** (Medium Priority)
**Files**: 3 files
1. `server/src/routes/admin/regions.ts` - New file with CRUD endpoints
2. `server/src/services/regions.ts` - New file with DB operations
3. `server/src/index.ts` - Register regions routes
4. `server/migrations/002_seed_regions.sql` - Seed initial regions

**Why Second**: Allows admin to manage regions properly

---

### **CHUNK 3: Add Insights Page** (Low Priority)
**Files**: 2 files
1. `admin/src/pages/Insights.tsx` - New file with analytics dashboard
2. `admin/src/App.tsx` - Add route for `/insights`

**Why Third**: Non-critical feature

---

### **CHUNK 4: Mobile Wallet Enhancements** (Future)
**Files**: 3-5 files
1. `mobile/lib/screens/wallet/wallet_screen.dart` - Add send flow
2. `mobile/lib/screens/wallet/scan_screen.dart` - New QR scanner
3. `mobile/lib/services/wallet_service.dart` - Blockchain integration
4. Add transaction history fetch

**Why Last**: Requires blockchain integration (Phase 1)

---

### **CHUNK 5: Profiles Directory** (Future - if needed)
**Files**: Multiple
1. Create `admin/src/pages/profiles/` directory
2. Add profile management pages
3. Add backend routes for user profiles

**Why Last**: Not mentioned in original spec

---

## 🚨 CRITICAL ISSUES

### Priority 1 (Blocking)
1. ❌ **Admin polls estimate endpoint mismatch** - Blocks poll creation
2. ❌ **Admin polls list endpoint missing** - Blocks viewing drafts/active polls
3. ❌ **Publish endpoint HTTP method mismatch** - Blocks poll publishing

### Priority 2 (Important)
4. ❌ **Regions not persistent** - Admin changes don't save
5. ❌ **Insights page missing** - Navigation broken

### Priority 3 (Nice to Have)
6. ❌ **Mobile wallet send/scan** - Phase 1 feature
7. ❌ **Profiles directory** - Not in original spec

---

**END OF REPORT**
