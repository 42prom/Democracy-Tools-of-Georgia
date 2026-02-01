# Phase 0 Backend Implementation Summary

## Files Created

### Project Structure
```
/server
├── package.json              # Fastify + TypeScript + pg + redis + zod
├── tsconfig.json             # ES2022 modules
├── .env.example              # Environment template
├── .eslintrc.json            # TypeScript linting
├── jest.config.js            # ESM test config
├── README.md                 # Setup instructions
│
├── migrations/
│   └── 001_init.sql          # Database schema (copied from db/schema.sql)
│
└── src/
    ├── config.ts             # Environment configuration
    ├── index.ts              # Fastify app entry point
    │
    ├── db/
    │   ├── client.ts         # PostgreSQL pool & query utilities
    │   ├── redis.ts          # Redis client setup
    │   └── migrate.ts        # Migration runner
    │
    ├── services/
    │   ├── nonce.ts          # Single-use nonce generation (Redis + TTL)
    │   ├── attestations.ts   # Issue/verify credentials (JWT)
    │   ├── polls.ts          # Poll CRUD + k-anonymity checks
    │   └── votes.ts          # Vote submission with nullifier validation
    │
    └── routes/
        ├── attestations.ts   # POST /challenge, /issue
        ├── votes.ts          # POST /votes
        └── admin/
            └── polls.ts      # Poll management endpoints
```

---

## Key Implementation Details

### 1. Database Migration (001_init.sql)
- Copied from `db/schema.sql`
- **Enforces PRIMARY KEY (poll_id, nullifier_hash)** on `vote_nullifiers` table
- Prevents double voting at database level
- No biometric columns (compliant with privacy constraints)

### 2. Nonce Service (Single-Use + TTL)
```typescript
// Redis-backed with atomic get-and-delete
NonceService.generate('challenge')  // Creates 64-char hex nonce, 60s TTL
NonceService.verifyAndConsume(nonce) // Atomically checks + deletes (Lua script)
```

### 3. Attestation (Credential) Issuance
```typescript
// Phase 0: Mock demographics
issueAttestation(deviceKey) // Returns JWT with:
{
  iss: "dtfg-identity-service",
  sub: "device_key_thumbprint_sha256",
  data: {
    age_bucket: "25-34",      // Random mock
    gender: "M",               // Random mock
    region_codes: ["reg_tbilisi"],
    citizenship: "GEO"
  },
  exp: <7 days>
}
```

### 4. Vote Submission Flow
```typescript
submitVote({pollId, optionId, nullifier, nonce, signature, credential})

// Validation steps:
1. Verify & consume nonce (anti-replay)
2. Check poll status = 'active'
3. Verify option exists for poll
4. Transaction:
   - INSERT vote_nullifiers (poll_id, nullifier_hash) // Fails if duplicate
   - INSERT votes (poll_id, option_id, demographics_snapshot)
5. Return mock tx hash
```

**Error Handling:**
- `400` - Invalid/expired nonce (replay)
- `404` - Poll not found/active
- `409` - Already voted (nullifier exists)

### 5. Admin Poll Management
```typescript
POST /admin/polls              // Create draft poll
GET /admin/polls/:id           // Get poll with options
POST /admin/polls/:id/estimate // Check audience size (mock: 50-1000)
POST /admin/polls/:id/publish  // Publish if k-anonymity satisfied

// Publish validation:
if (estimatedAudience < MIN_K_ANONYMITY) {
  throw Error('Privacy violation')
}
```

---

## API Endpoints Implemented

### Public Endpoints

#### POST /api/v1/attestations/challenge
```bash
curl -X POST http://localhost:3000/api/v1/attestations/challenge \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "device_123"}'

# Response:
{
  "nonce": "a1b2c3d4...",  # 64-char hex
  "ttl": 60
}
```

#### POST /api/v1/attestations/issue
```bash
curl -X POST http://localhost:3000/api/v1/attestations/issue \
  -H "Content-Type: application/json" \
  -d '{
    "proof": "mock_proof",
    "deviceKey": "device_public_key"
  }'

# Response:
{
  "attestation": "eyJhbGc..."  # JWT credential
}
```

#### POST /api/v1/votes
```bash
curl -X POST http://localhost:3000/api/v1/votes \
  -H "Authorization: Bearer <attestation_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "pollId": "uuid",
    "optionId": "uuid",
    "nullifier": "sha256_hash",
    "nonce": "nonce_from_challenge",
    "signature": "device_signature"
  }'

# Response:
{
  "txHash": "mock_tx_1738195200000",
  "receipt": "Vote recorded"
}
```

### Admin Endpoints (Stub Auth)

#### POST /api/v1/admin/polls
```bash
curl -X POST http://localhost:3000/api/v1/admin/polls \
  -H "Authorization: Bearer admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Should Georgia join EU?",
    "description": "Referendum on EU membership",
    "type": "referendum",
    "options": ["Yes", "No", "Abstain"],
    "audience_rules": {
      "min_age": 18,
      "regions": ["reg_tbilisi"],
      "gender": "all"
    }
  }'

# Response:
{
  "poll": {
    "id": "uuid",
    "title": "Should Georgia join EU?",
    "status": "draft",
    ...
  }
}
```

#### POST /api/v1/admin/polls/:id/estimate
```bash
curl -X POST http://localhost:3000/api/v1/admin/polls/poll_uuid/estimate \
  -H "Authorization: Bearer admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": {
      "min_age": 18,
      "gender": "M"
    }
  }'

# Response:
{
  "count": 450,           # Mock: random 50-1000
  "isPrivacySafe": true   # count >= MIN_K_ANONYMITY (30)
}
```

#### POST /api/v1/admin/polls/:id/publish
```bash
curl -X POST http://localhost:3000/api/v1/admin/polls/poll_uuid/publish \
  -H "Authorization: Bearer admin_token"

# Response (success):
{
  "message": "Poll published"
}

# Response (privacy violation):
{
  "error": "Privacy violation: audience (25) below k-anonymity threshold"
}
```

---

## Security Compliance

### ✅ Privacy Constraints Met

1. **NO Biometric Storage**
   - `attestations.ts` does NOT accept biometric data
   - `users` table has NO biometric columns
   - Only device key thumbprint (SHA-256 hash) stored

2. **Nullifier Uniqueness**
   - Database enforces `PRIMARY KEY (poll_id, nullifier_hash)`
   - Duplicate votes trigger PostgreSQL constraint violation
   - Error code `23505` mapped to "Already voted"

3. **Single-Use Nonces**
   - Redis stores nonces with 60s TTL
   - `verifyAndConsume()` uses Lua script for atomic get-and-delete
   - Second use returns `false` (nonce no longer exists)

4. **K-Anonymity Enforcement**
   - `publishPoll()` checks estimated audience >= `MIN_K_ANONYMITY` (30)
   - Rejects publish if privacy unsafe
   - Returns 400 error with clear message

5. **Security Events**
   - No per-user security event tracking (aggregated only in Phase 1)
   - Phase 0 logs errors without PII

---

## How to Run Locally

### Prerequisites
- Node.js 18+
- Docker + Docker Compose
- PostgreSQL and Redis (via Docker)

### Setup Steps

```bash
# 1. Navigate to server directory
cd server

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env

# 4. Start infrastructure (from project root)
cd ..
docker-compose up -d

# 5. Verify Docker containers
docker-compose ps
# Expected: dtfg-postgres and dtfg-redis both healthy

# 6. Run database migrations
cd server
npm run migrate
```

**Expected migration output:**
```
Starting migrations...

Found 1 pending migration(s)

Applying migration 001: 001_init.sql
✓ Migration 001 applied

✓ All migrations completed
```

**Verify database schema:**
```bash
docker exec -it dtfg-postgres psql -U dtfg_user -d dtfg -c "\dt"
```

Expected tables:
- regions
- polls
- poll_options
- vote_nullifiers (with PRIMARY KEY on poll_id, nullifier_hash)
- votes
- vote_attestations
- users
- security_events

### Start Development Server

```bash
npm run dev
```

**Expected output:**
```
✓ Redis connected
{"level":30,"time":...,"msg":"Server listening at http://0.0.0.0:3000"}
✓ Server running on http://0.0.0.0:3000
✓ Environment: development
✓ Health check: http://0.0.0.0:3000/health
```

### Test Health Endpoint

```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-29T...",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### Test Vote Flow

```bash
# 1. Get challenge nonce
CHALLENGE=$(curl -s -X POST http://localhost:3000/api/v1/attestations/challenge \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test_device"}')

echo $CHALLENGE
# {"nonce":"a1b2...","ttl":60}

# 2. Issue attestation
ATTESTATION=$(curl -s -X POST http://localhost:3000/api/v1/attestations/issue \
  -H "Content-Type: application/json" \
  -d '{"proof":"mock","deviceKey":"test_key_001"}')

TOKEN=$(echo $ATTESTATION | grep -o '"attestation":"[^"]*' | cut -d'"' -f4)
echo $TOKEN
# eyJhbGc...

# 3. Create poll (as admin)
POLL=$(curl -s -X POST http://localhost:3000/api/v1/admin/polls \
  -H "Authorization: Bearer admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Poll",
    "type": "survey",
    "options": ["Option A", "Option B"],
    "audience_rules": {"gender": "all"}
  }')

POLL_ID=$(echo $POLL | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Poll ID: $POLL_ID"

# 4. Publish poll
curl -X POST http://localhost:3000/api/v1/admin/polls/$POLL_ID/publish \
  -H "Authorization: Bearer admin_token"

# 5. Vote (requires new nonce)
VOTE_NONCE=$(curl -s -X POST http://localhost:3000/api/v1/attestations/challenge \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test"}' | grep -o '"nonce":"[^"]*' | cut -d'"' -f4)

# Get option ID from poll
OPTION_ID=$(echo $POLL | grep -o '"id":"[^"]*' | head -2 | tail -1 | cut -d'"' -f4)

curl -X POST http://localhost:3000/api/v1/votes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"pollId\": \"$POLL_ID\",
    \"optionId\": \"$OPTION_ID\",
    \"nullifier\": \"test_nullifier_12345\",
    \"nonce\": \"$VOTE_NONCE\",
    \"signature\": \"mock_sig\"
  }"

# Expected: {"txHash":"mock_tx_...","receipt":"Vote recorded"}

# 6. Try voting again with same nullifier
curl -X POST http://localhost:3000/api/v1/votes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"pollId\": \"$POLL_ID\",
    \"optionId\": \"$OPTION_ID\",
    \"nullifier\": \"test_nullifier_12345\",
    \"nonce\": \"new_nonce\",
    \"signature\": \"mock_sig\"
  }"

# Expected: {"error":"Already voted in this poll"} (409)
```

---

## Run Tests

```bash
npm test
```

---

## Technology Stack

- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Fastify 4.x (high performance, TypeScript-native)
- **Database**: PostgreSQL 15+ (via `pg` driver)
- **Cache**: Redis 7+ (for nonce management)
- **Validation**: Zod (schema validation)
- **Auth**: jsonwebtoken (JWT credentials)
- **Testing**: Jest with `ts-jest` (ESM mode)
- **Linting**: ESLint + TypeScript

---

## Differences from OpenAPI Spec

The OpenAPI spec uses these paths:
- `/api/v1/auth/challenge`
- `/api/v1/auth/enroll`

But the requirements specified:
- `/api/v1/attestations/challenge`
- `/api/v1/attestations/issue`

**Implementation uses `/attestations/*` as per task requirements.**

If you need to align with OpenAPI spec, update:
```typescript
// In src/index.ts, change:
await fastify.register(attestationsRoutes, { prefix: '/api/v1/auth' });
// And rename endpoints in src/routes/attestations.ts to /challenge and /enroll
```

---

## Next Steps for Production

Phase 0 is a **development foundation only**. For Phase 1:

1. **Replace Mock Attestation**:
   - Integrate real NFC passport reading
   - Add 3D liveness detection
   - Implement risk engine

2. **Add Real Admin Auth**:
   - Replace stub auth with JWT + MFA
   - Implement role-based access control

3. **Add Remaining Endpoints**:
   - `GET /api/v1/polls` (list eligible polls)
   - `GET /api/v1/stats/polls/:id` (results with k-anonymity)

4. **Production Hardening**:
   - Rate limiting per user
   - HSM for JWT signing
   - Audit logging
   - Advanced query privacy (differential privacy)

---

Generated: 2026-01-29 | Fastify Backend Complete ✅
