# Development Test Identity Profiles

**⚠️ DEVELOPMENT ONLY - DO NOT USE IN PRODUCTION**

This file contains test personal numbers for identity verification testing in development environments.

## Test Personal Numbers

Use these personal numbers to test the identity login/enrollment flow in the mobile app or via API.

### Young Adults (18-25)

| Personal Number | Gender | Birth Year | Age | Region(s)        | Description                    |
|-----------------|--------|------------|-----|------------------|--------------------------------|
| `12345678901`   | M      | 2002       | 24  | Tbilisi          | Male, 24, Tbilisi              |
| `12345678902`   | F      | 2001       | 25  | Tbilisi          | Female, 25, Tbilisi            |
| `12345678903`   | M      | 2004       | 22  | Batumi           | Male, 22, Batumi               |
| `12345678904`   | F      | 2006       | 20  | Kutaisi          | Female, 20, Kutaisi            |

### Adults (26-40)

| Personal Number | Gender | Birth Year | Age | Region(s)        | Description                    |
|-----------------|--------|------------|-----|------------------|--------------------------------|
| `23456789011`   | M      | 1990       | 36  | Tbilisi          | Male, 36, Tbilisi              |
| `23456789012`   | F      | 1985       | 41  | Batumi           | Female, 41, Batumi             |
| `23456789013`   | M      | 1995       | 31  | Rustavi          | Male, 31, Rustavi              |
| `23456789014`   | F      | 1992       | 34  | Gori             | Female, 34, Gori               |
| `23456789015`   | M      | 1988       | 38  | Zugdidi          | Male, 38, Zugdidi              |

### Middle-Aged (41-55)

| Personal Number | Gender | Birth Year | Age | Region(s)        | Description                    |
|-----------------|--------|------------|-----|------------------|--------------------------------|
| `34567890121`   | F      | 1975       | 51  | Tbilisi          | Female, 51, Tbilisi            |
| `34567890122`   | M      | 1980       | 46  | Batumi           | Male, 46, Batumi               |
| `34567890123`   | F      | 1978       | 48  | Poti             | Female, 48, Poti               |
| `34567890124`   | M      | 1982       | 44  | Telavi           | Male, 44, Telavi               |

### Seniors (56+)

| Personal Number | Gender | Birth Year | Age | Region(s)        | Description                    |
|-----------------|--------|------------|-----|------------------|--------------------------------|
| `45678901231`   | M      | 1960       | 66  | Tbilisi          | Male, 66, Tbilisi              |
| `45678901232`   | F      | 1965       | 61  | Batumi           | Female, 61, Batumi             |
| `45678901233`   | M      | 1958       | 68  | Kutaisi          | Male, 68, Kutaisi              |

### Multi-Region Users

| Personal Number | Gender | Birth Year | Age | Region(s)              | Description                    |
|-----------------|--------|------------|-----|------------------------|--------------------------------|
| `56789012341`   | F      | 1990       | 36  | Tbilisi, Batumi        | Female, 36, Tbilisi+Batumi     |
| `56789012342`   | M      | 1987       | 39  | Kutaisi, Rustavi       | Male, 39, Kutaisi+Rustavi      |

### Edge Cases

| Personal Number | Gender | Birth Year | Age | Region(s)        | Description                            |
|-----------------|--------|------------|-----|------------------|----------------------------------------|
| `67890123451`   | M      | 2008       | 18  | Tbilisi          | Male, 18 (youngest eligible), Tbilisi  |
| `67890123452`   | F      | 1945       | 81  | Batumi           | Female, 81 (senior), Batumi            |

---

## Usage

### Mobile App Testing

1. Launch mobile app in development mode
2. Navigate to enrollment flow
3. Enter one of the test personal numbers from above
4. Complete liveness + face match verification (mock will auto-pass)
5. User will be logged in with corresponding demographic profile

### API Testing

```bash
# Test login with young adult male from Tbilisi
curl -X POST http://localhost:3000/api/v1/auth/login-or-enroll \
  -H "Content-Type: application/json" \
  -d '{
    "pnDigits": "12345678901",
    "liveness": {"passed": true, "score": 0.85},
    "faceMatch": {"passed": true, "score": 0.88}
  }'

# Expected response:
{
  "success": true,
  "userId": "uuid...",
  "sessionAttestation": "eyJhbGc...",
  "isNewUser": false  // false if already seeded
}
```

---

## Seeding Instructions

### First-Time Setup

Run the seed script to populate test users:

```bash
cd backend

# Ensure you're in development mode
export NODE_ENV=development  # or set in .env

# Run seed script
npx tsx src/db/seed-dev-users.ts
```

**Expected output:**
```
🌱 Seeding development test users...
  ✓ Created: Male, 24, Tbilisi
  ✓ Created: Female, 25, Tbilisi
  ✓ Created: Male, 22, Batumi
  ...
✅ Seeding complete!
   Inserted: 20 users
   Skipped: 0 users (already existed)
```

### Re-running

If you run the script again, existing users will be skipped:

```
  ⊘ Skipped: Male, 24, Tbilisi (already exists)
  ⊘ Skipped: Female, 25, Tbilisi (already exists)
```

### Clearing Test Data

To reset test users:

```sql
-- WARNING: This deletes ALL users (including test users)
DELETE FROM users WHERE pn_hash IN (
  SELECT pn_hash FROM users
  WHERE created_at > NOW() - INTERVAL '31 days'  -- or use specific criteria
);
```

---

## Testing Scenarios

### Scenario 1: First-Time Enrollment
- Use PN: `12345678901`
- Should create new user and return `isNewUser: true`
- User should appear in admin panel (if user count > k-anonymity threshold)

### Scenario 2: Returning User Login
- Use same PN again: `12345678901`
- Should return existing user and `isNewUser: false`
- `last_login_at` should update

### Scenario 3: Multi-Region User
- Use PN: `56789012341`
- User should be eligible for polls in both Tbilisi and Batumi regions
- Test audience filtering with multi-region criteria

### Scenario 4: Age-Based Filtering
- Use PN: `67890123451` (18 years old)
- Should only see polls with `min_age <= 18`
- Use PN: `45678901231` (66 years old)
- Should see all age-appropriate polls

### Scenario 5: Gender-Based Filtering
- Use PN: `12345678901` (Male)
- Should only see polls for "all" or "male" gender
- Use PN: `12345678902` (Female)
- Should only see polls for "all" or "female" gender

---

## Security Notes

✅ **Safe for Development:**
- Personal numbers are fake and follow format validation
- No real personal data is exposed
- Test users exist only in development databases

⚠️ **Production Safety:**
- Seed script checks `NODE_ENV` and refuses to run in production
- This file should be `.gitignore`d or kept in docs only
- Never use these personal numbers in production systems

🔒 **Privacy Compliance:**
- Personal numbers are HMAC-hashed before storage
- Only hashed values stored in database
- Raw personal numbers exist only in this reference file

---

## Troubleshooting

### Seed Script Fails

**Error:** "Cannot seed test users in production!"
- **Solution:** Check that `NODE_ENV=development` in your environment

**Error:** Database connection failed
- **Solution:** Ensure PostgreSQL is running and `.env` has correct `DATABASE_URL`

### User Already Exists

**Error:** Duplicate key violation on `pn_hash`
- **Solution:** User was already seeded. This is safe to ignore or clear the user first.

### Login Fails with Test PN

**Error:** "Invalid personal number"
- **Solution:** Ensure backend is using same `PN_HASH_SECRET` as seed script
- Check that personal number is exactly 11 digits

---

## API Reference

### Login/Enroll with Test Profile

```bash
POST /api/v1/auth/login-or-enroll
Content-Type: application/json

{
  "pnDigits": "12345678901",
  "liveness": {
    "passed": true,
    "score": 0.85,
    "challenge": "smile",
    "timestamp": "2026-01-30T..."
  },
  "faceMatch": {
    "passed": true,
    "score": 0.88,
    "timestamp": "2026-01-30T..."
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionAttestation": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isNewUser": false
}
```

---

## Test Coverage

With these 20 test profiles, you can test:

- ✅ Age-based filtering (18-81 years old)
- ✅ Gender-based filtering (M/F)
- ✅ Region-based filtering (9 different regions)
- ✅ Multi-region users (2 profiles)
- ✅ Edge cases (youngest, oldest eligible voters)
- ✅ Time-based analytics (realistic created_at/last_login_at)
- ✅ Audience estimation accuracy
- ✅ K-anonymity enforcement

---

**Last Updated:** 2026-01-30
**Maintainer:** DTG Development Team
**Environment:** Development Only

