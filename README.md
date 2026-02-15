# DTG - Digital Transparency in Governance

A secure, privacy-preserving digital voting and civic engagement platform.

## Architecture

```
+------------------+     +------------------+     +------------------+
|  Mobile App      |     |  Admin Panel     |     |  Backend API     |
|  (Flutter)       |     |  (React/Vite)    |     |  (Node/Express)  |
|  Port: N/A       |     |  Port: 5173      |     |  Port: 3000      |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         |                        |                        |
         +------------------------+------------------------+
                                  |
                    +-------------+-------------+
                    |                           |
          +---------v---------+       +---------v---------+
          |  Docker Services  |       |  Docker Services  |
          |                   |       |                   |
          |  PostgreSQL:5432  |       |  Redis:6379       |
          |  Biometric:8000   |       |                   |
          +-------------------+       +-------------------+
```

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for backend and admin)
- Flutter 3.x (for mobile app)

## Quick Start

### 1. Start Docker Services

```bash
# Start PostgreSQL, Redis, and Biometric service
docker compose up -d

# Verify all services are healthy
docker compose ps
```

Expected output:
```
NAME                  STATUS
dtg-postgres          running (healthy)
dtg-redis             running (healthy)
dtg-biometric-service running (healthy)
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env if needed (defaults work for local development)
```

### 3. Run Backend

```bash
cd backend
npm install
npm run dev
```

Backend will be available at `http://localhost:3000`

### 4. Run Admin Panel

```bash
cd admin
npm install
npm run dev
```

Admin panel will be available at `http://localhost:5173`

### 5. Run Mobile App (Optional)

```bash
cd mobile
flutter pub get
flutter run
```

## Environment Variables

### Required (already set in .env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://dtg_user:dtg_dev_password@localhost:5432/dtg` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `BIOMETRIC_SERVICE_URL` | Biometric microservice URL | `http://localhost:8000` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Dev default |
| `PN_HASH_SECRET` | Personal number hashing secret | Dev default |
| `API_KEY_ENCRYPTION_SECRET` | API key encryption (min 32 chars) | Dev default |
| `DEVICE_HASH_SECRET` | Device ID hashing secret | Dev default |
| `VOTER_HASH_SECRET` | Voter identity hashing secret | Dev default |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:5173` |
| `MIN_K_ANONYMITY` | Minimum votes for k-anonymity | `30` |
| `BIOMETRIC_TIMEOUT_MS` | Biometric service timeout | `15000` |
| `LOG_LEVEL` | Logging level | `info` |

## Database Migrations

Migrations run automatically when PostgreSQL container starts (via `/docker-entrypoint-initdb.d`).

To run migrations manually:
```bash
cd backend
npm run migrate
```

## Admin Settings

The admin panel provides 5 settings categories:

1. **Blockchain** - Rewards, NFT payouts, RPC configuration
2. **Regions** - Geographic region management
3. **Verification Providers** - NFC, document scanning, liveness, face matching
4. **Security Policies** - Device policies, VPN detection, rate limiting
5. **Notifications** - Push notification configuration

Access at: `http://localhost:5173/settings`

## API Endpoints

### Health Check
```
GET /api/v1/health
```

### Admin Authentication
```
POST /api/v1/admin/auth/login
Body: { "email": "...", "password": "..." }
```

### Admin Settings
```
GET  /api/v1/admin/settings
PATCH /api/v1/admin/settings
```

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL 15 database |
| redis | 6379 | Redis 7 cache/session store |
| biometric-service | 8000 | Python FastAPI face verification |

### Biometric Service Endpoints

```
GET  /health              - Health check
POST /verify              - Face verification (two images)
POST /verify-normalized   - Extended verification with quality metadata
```

## Development

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Admin tests
cd admin
npm test
```

### Cleanup Debug Files

```bash
./scripts/cleanup-redundant-files.sh
```

## Troubleshooting

### Docker Services Not Starting

```bash
# Check logs
docker compose logs postgres
docker compose logs redis
docker compose logs biometric-service

# Restart services
docker compose down
docker compose up -d
```

### Database Connection Failed

1. Verify PostgreSQL is running: `docker compose ps`
2. Check DATABASE_URL matches docker-compose.yml credentials
3. Ensure port 5432 is not in use by another process

### Biometric Service Errors

1. First startup downloads ML models (~500MB) - may take a few minutes
2. Check logs: `docker compose logs biometric-service`
3. Verify port 8000 is accessible: `curl http://localhost:8000/health`

## Production Deployment

**IMPORTANT:** Before deploying to production:

1. Generate secure random values for all `*_SECRET` variables
2. Set `NODE_ENV=production`
3. Configure proper `CORS_ORIGIN`
4. Set `MIN_K_ANONYMITY=30` or higher
5. Use proper SSL/TLS certificates
6. Review and harden security policies

## License

Proprietary - All rights reserved.
