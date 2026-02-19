# Stability Matrix - AntyGravity System

## Overview

This document describes the dependency relationships, health checks, timeout/retry configurations, and failure simulation plan for the AntyGravity system.

## Dependency Matrix

| Dependency | URL | Timeout | Retries | Circuit Breaker | Health Check | Notes |
|------------|-----|---------|---------|-----------------|--------------|-------|
| Backend -> Postgres | DATABASE_URL env | 5s connect, 30s query | Pool auto-reconnect | No | `SELECT 1` | Primary data store |
| Backend -> Redis | REDIS_URL env | 5s connect | Auto-reconnect | No | `PING` | Rate limiting, nonce cache |
| Backend -> Biometric Service | BIOMETRIC_SERVICE_URL env | 30s (health: 3s) | 3 retries | Yes (5 failures -> 30s open) | GET /health | Face matching, liveness |
| Admin -> Backend | VITE_API_BASE_URL env | 15s | 3 retries (GET only) | No | Via /health proxy | Admin panel API |
| Mobile -> Backend | AppConfig.apiBaseUrl | 15s | 1 retry (GET only) | No | N/A | Flutter mobile app |

## Health Check Endpoint

**Endpoint:** `GET /health`

**Response Format:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "dependencies": {
    "postgres": { "status": "up", "latency_ms": 5 },
    "redis": { "status": "up", "latency_ms": 2 },
    "biometric-service": { "status": "up", "latency_ms": 120, "circuit_breaker": "closed" }
  }
}
```

**HTTP Status Codes:**
- 200: All dependencies healthy or degraded but accepting traffic
- 503: One or more critical dependencies down

## Circuit Breaker Configuration

The biometric service uses a circuit breaker pattern:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Failure Threshold | 5 | Number of failures before opening circuit |
| Recovery Timeout | 30s | Time before attempting half-open state |
| Success Threshold | 2 | Successes needed in half-open to close |

## Retry Configuration

### Backend HTTP Client
- Max Retries: 3
- Backoff: Exponential (1s, 2s, 4s) + jitter (0-300ms)
- Retryable: 408, 429, 500, 502, 503, 504
- Retryable Errors: ECONNABORTED, ETIMEDOUT, ECONNRESET, ERR_NETWORK

### Admin Panel (axios)
- Max Retries: 3 (configurable via VITE_API_MAX_RETRIES)
- Backoff: Exponential + jitter
- Only GET requests are retried (idempotent)

### Mobile App (http package)
- Max Retries: 1
- Backoff: 500ms base + jitter
- Only GET requests are retried

## Payload Size Limits

| Endpoint | Max Size | Notes |
|----------|----------|-------|
| POST /api/v1/enrollment/liveness | 10MB | Selfie + doc portrait base64 |
| POST /api/v1/enrollment/document | 5MB | MRZ + encrypted data |
| Default | 1MB | JSON body limit |

**Note:** Large payloads (portraits) are sent in body, NOT headers.

## Failure Simulation Plan

### Test 1: Biometric Service Down

**Scenario:** Biometric service unreachable
**Steps:**
1. Stop biometric-service container
2. Attempt enrollment liveness check
3. Verify graceful error message to user
4. Verify circuit breaker opens after 5 failures
5. Verify /health shows biometric-service: down

**Expected:**
- User sees "Verification service temporarily unavailable"
- Circuit breaker prevents hammering failed service
- Other endpoints continue working

### Test 2: Redis Down

**Scenario:** Redis unavailable
**Steps:**
1. Stop Redis container
2. Attempt login (nonce generation)
3. Verify rate limiting fallback

**Expected:**
- Login may fail with "Service temporarily unavailable"
- No cascading failures to other endpoints
- /health shows redis: down

### Test 3: Database Down

**Scenario:** PostgreSQL unavailable
**Steps:**
1. Stop PostgreSQL container
2. Attempt any authenticated API call
3. Verify error handling

**Expected:**
- 503 Service Unavailable responses
- /health shows postgres: down, status: unhealthy
- No data corruption

### Test 4: Network Flaps

**Scenario:** Intermittent network connectivity
**Steps:**
1. Use network throttling (tc on Linux, Network Link Conditioner on macOS)
2. Simulate 30% packet loss
3. Perform vote submission

**Expected:**
- Retry logic handles transient failures
- Vote is eventually recorded
- No duplicate votes (nullifier protection)

### Test 5: Slow Backend

**Scenario:** Backend response time > 15s
**Steps:**
1. Add artificial delay to backend handler
2. Make request from admin panel
3. Verify timeout handling

**Expected:**
- Request times out after 15s
- User sees "Request timed out" error
- Retry logic attempts if GET request

## Graceful Degradation Strategy

1. **Biometric Service Down:** Block new enrollments, allow existing users to vote
2. **Redis Down:** Fall back to stateless operation where possible, block rate-limited endpoints
3. **Database Down:** Block all operations, return 503
4. **Network Issues:** Retry with backoff, circuit breaker prevents cascade

## Monitoring Recommendations

1. **Metrics Endpoint:** `GET /health/metrics` provides request counts, error rates
2. **Alert Thresholds:**
   - Health check failures: > 2 consecutive
   - Circuit breaker open: immediate alert
   - Request latency p99 > 5s: warning
3. **Log Aggregation:** Structured JSON logs with request IDs for tracing

## Recovery Procedures

### Database Recovery
1. Restore from backup if data loss
2. Run pending migrations: `npm run migrate`
3. Verify health endpoint
4. Clear rate limit cache if needed

### Redis Recovery
1. Restart Redis service
2. Clear stale rate limit entries if needed
3. Verify health endpoint

### Biometric Service Recovery
1. Restart service
2. Wait for circuit breaker to close (30s)
3. Test enrollment flow manually
