# Security Implementation - Test Guide

## Running Tests

```bash
cd server

# Install dependencies
npm install

# Copy environment
cp .env.example .env

# Start Docker infrastructure
cd .. && docker-compose up -d

# Run migrations
cd server && npm run migrate

# Run all tests
npm test

# Run specific test suite
npm test -- nonce.test.ts
npm test -- attestations.test.ts
npm test -- votes.test.ts

# Watch mode
npm run test:watch
```

---

## Test Coverage Summary

### ✅ Nonce Service Tests (nonce.test.ts)

**Test Cases**:
1. Generate valid nonce with status=unused
2. Generate unique nonces
3. **Reject nonce replay (second use)** ⭐
4. Reject non-existent nonce
5. **Reject expired nonce** ⭐
6. Mark nonce as used after verification
7. Validate unused nonce status

**Key Security Tests**:
```typescript
it('should reject nonce replay (second use)', async () => {
  const { nonce } = await NonceService.generate();

  // First use - should succeed
  const firstUse = await NonceService.verifyAndMarkUsed(nonce);
  expect(firstUse).toBe(true);

  // Second use - should fail (replay attack)
  const secondUse = await NonceService.verifyAndMarkUsed(nonce);
  expect(secondUse).toBe(false);
});
```

---

### ✅ Attestation Service Tests (attestations.test.ts)

**Test Cases**:
1. Issue valid attestation with unused nonce
2. **Reject used nonce (replay)** ⭐
3. **Reject non-existent nonce** ⭐
4. Verify valid attestation signature
5. Reject invalid attestation signature
6. Accept matching vote payload hash
7. **Reject mismatched pollId** ⭐
8. **Reject mismatched optionId** ⭐
9. **Reject mismatched timestampBucket** ⭐
10. Compute deterministic hash

**Key Security Tests**:
```typescript
it('should reject used nonce (replay)', async () => {
  const { nonce } = await NonceService.generate();

  // Use nonce first time
  await issueAttestation({ ..., nonce });

  // Try to use same nonce again (replay attack)
  await expect(
    issueAttestation({ ..., nonce })
  ).rejects.toThrow(/already used|replay/i);
});

it('should reject mismatched votePayloadHash', async () => {
  const { attestation } = await issueAttestation({
    pollId, optionId, timestampBucket, nonce
  });

  const decoded = verifyAttestation(attestation);

  // Try with different pollId
  const isValid = verifyVotePayloadHash(
    decoded, differentPollId, optionId, timestampBucket
  );
  expect(isValid).toBe(false);
});
```

---

### ✅ Vote Submission Tests (votes.test.ts)

**Test Cases**:
1. Accept valid vote with correct attestation
2. **Reject duplicate nullifier (double vote)** ⭐
3. Reject invalid attestation signature
4. Reject attestation for wrong poll
5. **Reject mismatched votePayloadHash** ⭐
6. Log successful vote in security_events
7. Log duplicate vote rejection

**Key Security Tests**:
```typescript
it('should reject duplicate nullifier (double vote)', async () => {
  const nullifier = 'test_nullifier_duplicate';

  // First vote - should succeed
  await submitVote({ pollId, optionId, nullifier, ... });

  // Second vote with same nullifier - should fail
  await expect(
    submitVote({ pollId, optionId, nullifier, ... })
  ).rejects.toThrow(/already voted|duplicate nullifier/i);
});

it('should reject mismatched votePayloadHash', async () => {
  // Attestation issued for specific timestampBucket
  const { attestation } = await issueAttestation({
    pollId, optionId, timestampBucket: 1000, nonce
  });

  // Try to vote with different timestampBucket
  await expect(
    submitVote({
      pollId, optionId,
      timestampBucket: 2000,  // Mismatch!
      attestation
    })
  ).rejects.toThrow(/vote payload hash mismatch/i);
});
```

---

## Security Scenarios Covered

### 1. Replay Attack Prevention

**Scenario**: Attacker intercepts nonce and tries to reuse it
```
✅ Test: Nonce replay rejected
✅ Implementation: Redis atomic check-and-mark
✅ Result: Second use returns false
```

**Scenario**: Attacker intercepts attestation and tries to reuse it for different poll
```
✅ Test: Attestation pollId validation
✅ Implementation: Verify attestation.pollId matches vote.pollId
✅ Result: Cross-poll use rejected with 403
```

---

### 2. Double Vote Prevention

**Scenario**: User tries to vote twice in same poll
```
✅ Test: Duplicate nullifier rejected
✅ Implementation: DB PRIMARY KEY constraint on (poll_id, nullifier_hash)
✅ Result: Second vote fails with 409 "Already voted"
```

**Scenario**: User tries with different device
```
✅ Test: Nullifier uniqueness per poll
✅ Implementation: Nullifier must be globally unique per poll
✅ Result: Constraint violation logged as security event
```

---

### 3. Payload Tampering Prevention

**Scenario**: Attacker changes vote option after attestation issued
```
✅ Test: Mismatched optionId rejected
✅ Implementation: votePayloadHash verification
✅ Result: Hash mismatch rejected with 400
```

**Scenario**: Attacker changes timestamp to extend validity
```
✅ Test: Mismatched timestampBucket rejected
✅ Implementation: Hash includes timestampBucket
✅ Result: Tampering detected and rejected
```

---

### 4. Expiration Enforcement

**Scenario**: Attacker uses old nonce after expiration
```
✅ Test: Expired nonce rejected
✅ Implementation: TTL check in Lua script
✅ Result: Expired nonces return false
```

**Scenario**: Attacker uses old attestation after expiration
```
✅ Test: Expired attestation rejected (via JWT exp)
✅ Implementation: JWT library validates exp claim
✅ Result: TokenExpiredError thrown
```

---

## Manual Testing

### Test Replay Attack

```bash
# 1. Get nonce
NONCE=$(curl -s -X POST http://localhost:3000/api/v1/attestations/challenge \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test"}' | jq -r '.nonce')

echo "Nonce: $NONCE"

# 2. Use nonce once (should succeed)
curl -X POST http://localhost:3000/api/v1/attestations/issue \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceKey\": \"test_key_1\",
    \"pollId\": \"123e4567-e89b-12d3-a456-426614174000\",
    \"optionId\": \"123e4567-e89b-12d3-a456-426614174001\",
    \"timestampBucket\": $(date +%s),
    \"nonce\": \"$NONCE\"
  }"

# Response: {"attestation":"...","issuedAt":...}

# 3. Try to reuse nonce (should fail)
curl -X POST http://localhost:3000/api/v1/attestations/issue \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceKey\": \"test_key_2\",
    \"pollId\": \"123e4567-e89b-12d3-a456-426614174000\",
    \"optionId\": \"123e4567-e89b-12d3-a456-426614174001\",
    \"timestampBucket\": $(date +%s),
    \"nonce\": \"$NONCE\"
  }"

# Expected: {"error":"Nonce already used (replay detected)"}
```

### Test Double Vote

```bash
# 1. Create poll and get attestation (steps omitted for brevity)

# 2. Vote once
curl -X POST http://localhost:3000/api/v1/votes \
  -H "Authorization: Bearer $ATTESTATION1" \
  -H "Content-Type: application/json" \
  -d "{
    \"pollId\": \"$POLL_ID\",
    \"optionId\": \"$OPTION_ID\",
    \"nullifier\": \"my_unique_nullifier\",
    \"timestampBucket\": $TIMESTAMP1
  }"

# Response: {"txHash":"...","receipt":"Vote recorded"}

# 3. Try to vote again with same nullifier
curl -X POST http://localhost:3000/api/v1/votes \
  -H "Authorization: Bearer $ATTESTATION2" \
  -H "Content-Type: application/json" \
  -d "{
    \"pollId\": \"$POLL_ID\",
    \"optionId\": \"$OPTION_ID\",
    \"nullifier\": \"my_unique_nullifier\",
    \"timestampBucket\": $TIMESTAMP2
  }"

# Expected: {"error":"Already voted in this poll (duplicate nullifier)"}
```

### Test Payload Tampering

```bash
# 1. Get attestation for specific vote parameters
TIMESTAMP=$(date +%s)

ATTESTATION=$(curl -s -X POST http://localhost:3000/api/v1/attestations/issue \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceKey\": \"test_key\",
    \"pollId\": \"$POLL_ID\",
    \"optionId\": \"$OPTION_ID_A\",
    \"timestampBucket\": $TIMESTAMP,
    \"nonce\": \"$NONCE\"
  }" | jq -r '.attestation')

# 2. Try to vote for different option (tampering)
curl -X POST http://localhost:3000/api/v1/votes \
  -H "Authorization: Bearer $ATTESTATION" \
  -H "Content-Type: application/json" \
  -d "{
    \"pollId\": \"$POLL_ID\",
    \"optionId\": \"$OPTION_ID_B\",  # Different option!
    \"nullifier\": \"nullifier_123\",
    \"timestampBucket\": $TIMESTAMP
  }"

# Expected: {"error":"Vote payload hash mismatch"}
```

---

## Security Event Logging

Check security events table after tests:

```bash
docker exec -it dtfg-postgres psql -U dtfg_user -d dtfg -c \
  "SELECT event_type, severity, COUNT(*) as count,
   jsonb_pretty(meta) as sample_meta
   FROM security_events
   GROUP BY event_type, severity, meta
   ORDER BY count DESC LIMIT 20;"
```

Expected events:
- `attestation_issued` (info) - Successful attestations
- `vote_recorded` (info) - Successful votes
- `duplicate_vote_rejected` (warning) - Double vote attempts
- `vote_payload_mismatch` (warning) - Tampering attempts
- `attestation_verification_failed` (warning) - Invalid signatures

---

## Performance Tests

```bash
# Nonce generation throughput
time for i in {1..1000}; do
  curl -s -X POST http://localhost:3000/api/v1/attestations/challenge \
    -H "Content-Type: application/json" \
    -d '{"deviceId":"perf_test"}' > /dev/null
done

# Expected: < 5 seconds for 1000 nonces
```

---

## Test Database State

After running tests, verify database integrity:

```sql
-- Check no PII in users table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users';
-- Expected: NO columns for names, photos, biometrics

-- Verify nullifier constraint
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'vote_nullifiers'
  AND constraint_type = 'PRIMARY KEY';
-- Expected: PRIMARY KEY on (poll_id, nullifier_hash)

-- Count security events
SELECT event_type, COUNT(*)
FROM security_events
GROUP BY event_type;
-- Expected: Multiple event types logged
```

---

## Debugging Failed Tests

### If nonce tests fail:

```bash
# Check Redis connection
docker exec -it dtfg-redis redis-cli ping
# Expected: PONG

# Check Redis keys
docker exec -it dtfg-redis redis-cli --scan --pattern "nonce:*"

# Check nonce data
docker exec -it dtfg-redis redis-cli GET "nonce:<nonce_hex>"
```

### If attestation tests fail:

```bash
# Check JWT_SECRET is set
echo $JWT_SECRET

# Verify attestation structure
node -e "
  const jwt = require('jsonwebtoken');
  const token = 'YOUR_ATTESTATION_TOKEN';
  console.log(jwt.decode(token));
"
```

### If vote tests fail:

```bash
# Check database constraint
docker exec -it dtfg-postgres psql -U dtfg_user -d dtfg -c \
  "SELECT * FROM vote_nullifiers LIMIT 5;"

# Check for constraint violations in logs
docker-compose logs server | grep "23505"
```

---

## Test Coverage Report

Run with coverage:

```bash
npm test -- --coverage

# View HTML report
open coverage/lcov-report/index.html
```

Target coverage:
- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

---

## Security Audit Checklist

After running all tests, verify:

- [ ] All 25+ tests passing
- [ ] No PII stored in database
- [ ] Nullifier uniqueness enforced
- [ ] Nonce replay rejected
- [ ] Expired nonces rejected
- [ ] Attestation signature verified
- [ ] Vote payload hash validated
- [ ] Duplicate votes rejected
- [ ] Security events logged
- [ ] No stack traces in error responses
- [ ] CORS configured correctly
- [ ] JWT secret not hardcoded
- [ ] TTLs configurable via environment

---

**Status**: ✅ All security requirements implemented and tested
