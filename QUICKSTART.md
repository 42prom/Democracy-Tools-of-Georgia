# DTFG Phase 0 - Quick Start Guide

## ✅ What Was Built

### Infrastructure
- ✅ Monorepo structure (backend + admin)
- ✅ Docker Compose (PostgreSQL 15 + Redis 7)
- ✅ Database migrations system
- ✅ Environment configuration
- ✅ CI/CD pipeline (GitHub Actions)

### Backend API (Node.js + TypeScript)
- ✅ Express server with security middleware
- ✅ Structured JSON logging
- ✅ PostgreSQL connection pool
- ✅ Redis client for nonce management
- ✅ JWT-based authentication
- ✅ Health check endpoint
- ✅ Mock enrollment (Phase 0)
- ✅ Poll management (create, publish, estimate audience)
- ✅ Vote submission with nullifier validation
- ✅ Results query with k-anonymity enforcement
- ✅ Unit and integration tests

### Admin Panel (React + TypeScript)
- ✅ Login page (mock auth)
- ✅ Dashboard with stats
- ✅ Create Poll form with audience estimator
- ✅ Privacy warning for small cohorts
- ✅ TailwindCSS dark theme

### Security Features (Phase 0 Level)
- ✅ No biometric data stored
- ✅ JWT credentials with demographic buckets
- ✅ Single-use nonces (60s TTL)
- ✅ Nullifier-based double-vote prevention
- ✅ K-anonymity enforcement (k=30)
- ✅ CORS + security headers

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- npm or pnpm

### 1. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and update JWT_SECRET (IMPORTANT!)
# For development, defaults are fine
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify containers are running
docker-compose ps

# Expected output: dtfg-postgres and dtfg-redis both healthy
```

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Admin panel
cd ../admin
npm install
```

### 4. Run Database Migrations

```bash
cd backend
npm run migrate
```

Expected output:
```
Starting database migrations...
Found 1 pending migration(s)
Applying migration 001: 001_init.sql
✓ Migration 001 applied successfully
✓ All migrations completed successfully
```

### 5. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

Expected output:
```
✓ Redis connected
✓ Server running on http://localhost:3000
✓ Environment: development
✓ Health check: http://localhost:3000/health
```

**Terminal 2 - Admin Panel:**
```bash
cd admin
npm run dev
```

Expected output:
```
  VITE v5.0.8  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

---

## 🧪 Testing the System

### 1. Test Health Endpoint

```bash
curl http://localhost:3000/health
```

Expected response:
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

### 2. Test Mock Enrollment

```bash
# Get challenge nonce
curl -X POST http://localhost:3000/api/v1/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "test_device_001"}'

# Response: {"nonce":"...","ttl":60}

# Enroll (mock)
curl -X POST http://localhost:3000/api/v1/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"proof":"mock","deviceKey":"test_key_001"}'

# Response: {"credential":"eyJhbGc..."}
# Copy this JWT for next steps
```

### 3. Test Admin Panel

1. Open http://localhost:5173/
2. Login with:
   - Email: `admin@dtfg.ge`
   - Password: `phase0password`
3. Click "Create Poll"
4. Fill in poll details
5. Click "Estimate Audience" (returns mock count 50-1000)
6. Click "Save as Draft"

### 4. Test Voting Flow

```bash
# List eligible polls (use JWT from enrollment)
curl http://localhost:3000/api/v1/polls \
  -H "Authorization: Bearer <your_jwt_token>"

# Submit vote (requires poll ID and option ID from above)
curl -X POST http://localhost:3000/api/v1/polls/<poll_id>/vote \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pollId": "<poll_id>",
    "optionId": "<option_id>",
    "nullifier": "test_nullifier_12345",
    "nonce": "<get_from_challenge>",
    "signature": "mock_sig"
  }'

# Try voting again with same nullifier -> Should get 409 error
```

### 5. Run Tests

```bash
cd backend
npm test
```

Expected output:
```
 PASS  tests/health.test.ts
 PASS  tests/nonce.test.ts
 PASS  tests/auth.test.ts

Test Suites: 3 passed, 3 total
Tests:       10 passed, 10 total
```

---

## 📋 API Endpoints Reference

### Public Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/health` | Health check | None |
| POST | `/api/v1/auth/challenge` | Get nonce | None |
| POST | `/api/v1/auth/enroll` | Enroll device (mock) | None |
| GET | `/api/v1/polls` | List eligible polls | JWT |
| POST | `/api/v1/polls/:id/vote` | Submit vote | JWT |
| GET | `/api/v1/stats/polls/:id` | Get results | None |

### Admin Endpoints (Mock Auth)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/v1/admin/polls` | Create poll | Admin Token |
| POST | `/api/v1/admin/polls/estimate` | Estimate audience | Admin Token |
| PATCH | `/api/v1/admin/polls/:id/publish` | Publish poll | Admin Token |

---

## 🔒 Security Checklist (Phase 0)

- [x] No biometric data stored
- [x] No PII in database
- [x] JWT secret in environment variable
- [x] Nonces are single-use with TTL
- [x] Nullifiers prevent double-voting
- [x] K-anonymity enforced at publish & query
- [x] CORS configured
- [x] Security headers (Helmet)
- [x] Error responses don't leak stack traces
- [x] Database transactions for vote recording

---

## 🐛 Troubleshooting

### Database connection failed
```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
```

### Redis connection failed
```bash
# Test Redis
docker exec -it dtfg-redis redis-cli ping
# Expected: PONG

# Restart if needed
docker-compose restart redis
```

### Port already in use
Edit `docker-compose.yml` and change port mappings:
```yaml
ports:
  - "5433:5432"  # Change 5432 to 5433 if port conflict
```

### Migration fails
```bash
# Reset database (WARNING: Deletes all data)
docker-compose down -v
docker-compose up -d
cd backend && npm run migrate
```

---

## 📁 Project Structure

```
/antygravity
├── .env.example           # Environment template
├── .gitignore
├── docker-compose.yml     # PostgreSQL + Redis
├── README.md
├── QUICKSTART.md         # This file
│
├── backend/              # Node.js API
│   ├── src/
│   │   ├── db/           # Database clients
│   │   │   ├── client.ts # PostgreSQL pool
│   │   │   ├── redis.ts  # Redis client
│   │   │   └── migrate.ts# Migration runner
│   │   ├── middleware/
│   │   │   ├── auth.ts   # JWT verification
│   │   │   ├── errorHandler.ts
│   │   │   ├── logger.ts
│   │   │   └── security.ts
│   │   ├── routes/
│   │   │   ├── admin/
│   │   │   │   └── polls.ts
│   │   │   ├── auth.ts
│   │   │   ├── health.ts
│   │   │   ├── polls.ts
│   │   │   └── stats.ts
│   │   ├── services/
│   │   │   ├── analytics.ts
│   │   │   ├── credentials.ts
│   │   │   ├── nonce.ts
│   │   │   ├── polls.ts
│   │   │   └── voting.ts
│   │   ├── types/
│   │   │   ├── credentials.ts
│   │   │   └── polls.ts
│   │   └── index.ts      # Express app
│   ├── tests/            # Jest tests
│   └── package.json
│
├── admin/                # React UI
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout.tsx
│   │   ├── pages/
│   │   │   ├── CreatePoll.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── Login.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── package.json
│
├── db/
│   ├── schema.sql        # Canonical schema
│   └── migrations/
│       └── 001_init.sql  # Initial migration
│
├── api/
│   └── openapi_v1.yaml   # API spec
│
└── docs/
    ├── dtfg_system_spec.md
    └── roadmap.md
```

---

## ⏭️ Next Steps (Phase 1)

Phase 0 provides a working foundation with mock authentication. Phase 1 will add:

1. **Real Identity Verification**
   - NFC passport reading (ICAO 9303)
   - 3D liveness detection
   - Face matching (probe vs. chip portrait)
   - Risk engine (IP reputation, device attestation)

2. **Production Security**
   - HSM for credential signing
   - Rate limiting per user
   - Advanced query privacy (differential privacy)
   - Production-grade admin authentication (MFA)

3. **Mobile App**
   - React Native or Flutter
   - Secure Enclave / Keystore for credentialSecret
   - Biometric unlock for voting

See [docs/roadmap.md](docs/roadmap.md) for full Phase 1 plan.

---

## 📝 Notes

- **Phase 0 Status**: Foundation complete, mock authentication only
- **Production Ready**: NO - Phase 0 is for development and testing
- **Biometric Data**: Not implemented (Phase 1)
- **Blockchain**: Not implemented (Phase 2)
- **Admin Auth**: Mock only (hardcoded password)

**Do not deploy Phase 0 to production!**

---

## 🆘 Need Help?

- Check [README.md](README.md) for detailed documentation
- Review [docs/dtfg_system_spec.md](docs/dtfg_system_spec.md) for system design
- Run `npm test` to verify setup
- Check Docker logs: `docker-compose logs -f`

---

Generated: 2026-01-29 | Phase 0 Implementation Complete ✅
