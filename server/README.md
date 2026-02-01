# DTFG Server - Phase 0

Fastify-based backend API with PostgreSQL and Redis.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env

# 3. Start infrastructure (from root directory)
docker-compose up -d

# 4. Run migrations
npm run migrate

# 5. Start dev server
npm run dev
```

Server will run at http://localhost:3000

## Endpoints Implemented

### Public
- `GET /health` - Health check
- `POST /api/v1/attestations/challenge` - Get nonce
- `POST /api/v1/attestations/issue` - Issue credential (mock)
- `POST /api/v1/votes` - Submit vote

### Admin (stub auth)
- `POST /api/v1/admin/polls` - Create poll
- `GET /api/v1/admin/polls/:id` - Get poll
- `POST /api/v1/admin/polls/:id/estimate` - Estimate audience
- `POST /api/v1/admin/polls/:id/publish` - Publish poll

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Linting
npm run lint
```

## Security Features

✅ NO biometric data stored
✅ Nonces are single-use with TTL
✅ Nullifier uniqueness enforced (DB constraint)
✅ Vote replay protection
✅ K-anonymity checks on publish

## Database

Migrations are in `/server/migrations/`.

Schema enforces:
- `PRIMARY KEY (poll_id, nullifier_hash)` on vote_nullifiers (prevents double voting)
- No biometric columns
- Aggregated security events only
