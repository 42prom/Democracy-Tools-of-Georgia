# DTFG - Democratic Tools for Georgia

Privacy-preserving voting system with NFC passport verification and k-anonymity guarantees.

## Phase 0 Status

**Current Phase**: Foundation (Mock Authentication)

- ✅ Core infrastructure setup
- ✅ Database schema
- ✅ Mock enrollment API
- ⏳ Admin panel shell
- ❌ Real NFC/Liveness (Phase 1)
- ❌ Blockchain integration (Phase 2)

## Architecture

- **Backend**: Node.js + TypeScript + Express + PostgreSQL + Redis
- **Admin Panel**: React + TypeScript + Vite
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or pnpm

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd antygravity
cp .env.example .env
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Wait for health checks
docker-compose ps
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

### 4. Run Migrations

```bash
cd backend
npm run migrate
```

### 5. Start Development Servers

```bash
# Terminal 1: Backend API
cd backend
npm run dev

# Terminal 2: Admin Panel
cd admin
npm run dev
```

Backend API: http://localhost:3000
Admin Panel: http://localhost:5173

## Project Structure

```
/
├── api/                  # OpenAPI specification
│   └── openapi_v1.yaml
├── architecture/         # Architecture diagrams
├── backend/             # Node.js API
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── middleware/  # Express middleware
│   │   └── db/          # Database clients
│   └── tests/           # Jest tests
├── admin/               # React admin panel
│   └── src/
│       ├── pages/       # UI pages
│       └── components/  # Reusable components
├── db/                  # Database
│   ├── schema.sql       # Canonical schema
│   └── migrations/      # Migration scripts
└── docs/                # Documentation
    ├── dtfg_system_spec.md
    └── roadmap.md
```

## API Endpoints

### Public Endpoints

- `GET /health` - Health check
- `POST /api/v1/auth/challenge` - Get nonce
- `POST /api/v1/auth/enroll` - Enroll (mock)
- `GET /api/v1/polls` - List eligible polls
- `POST /api/v1/polls/{id}/vote` - Submit vote
- `GET /api/v1/stats/polls/{id}` - Get results

### Admin Endpoints (Mock Auth)

- `POST /api/v1/admin/polls` - Create poll
- `POST /api/v1/admin/polls/estimate` - Estimate audience
- `PATCH /api/v1/admin/polls/{id}/publish` - Publish poll

## Development

### Run Tests

```bash
cd backend
npm test
```

### Run Linting

```bash
npm run lint
```

### Database Migrations

```bash
npm run migrate        # Run pending migrations
npm run migrate:down   # Rollback last migration
```

## Security Constraints

**Non-Negotiable Privacy Rules:**

1. ❌ NO biometric storage (passport images, selfies, chip portraits)
2. ❌ NO PII in database or admin views
3. ✅ Nullifier-based double-vote prevention
4. ✅ Single-use nonces with 60s TTL
5. ✅ K-anonymity (k≥30) enforced at publish & query time

## Mock Authentication (Phase 0)

For development, the enrollment endpoint accepts any `deviceKey` and returns a mock credential with random demographics.

**Admin Login:**
- Email: `admin@dtfg.ge`
- Password: `phase0password`

## Testing Vote Flow

```bash
# 1. Get challenge nonce
curl -X POST http://localhost:3000/api/v1/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "test_device_001"}'

# 2. Enroll (mock)
curl -X POST http://localhost:3000/api/v1/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"proof": "mock", "deviceKey": "test_key_001"}'

# 3. List polls (use JWT from step 2)
curl http://localhost:3000/api/v1/polls \
  -H "Authorization: Bearer <jwt_token>"

# 4. Vote
curl -X POST http://localhost:3000/api/v1/polls/{poll_id}/vote \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pollId": "uuid",
    "optionId": "uuid",
    "nullifier": "sha256_hash",
    "nonce": "nonce_from_challenge",
    "signature": "mock_sig"
  }'
```

## Troubleshooting

### Database connection failed

```bash
# Check containers are running
docker-compose ps

# View logs
docker-compose logs postgres
```

### Redis connection failed

```bash
# Test Redis connection
docker exec -it dtfg-redis redis-cli ping
```

### Port conflicts

Edit `docker-compose.yml` to change port mappings if 5432 or 6379 are in use.

## Documentation

- [System Specification](docs/dtfg_system_spec.md)
- [Roadmap](docs/roadmap.md)
- [OpenAPI Spec](api/openapi_v1.yaml)
- [Implementation Checklist](IMPLEMENTATION_CHECKLIST.md)

## License

Proprietary - Democratic Tools for Georgia
