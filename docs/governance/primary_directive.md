# Google Antigravity — Primary Directive (Enhanced v2.2)

GOAL
Finish a production-secure, dev-friendly, premium-class verification + enrollment + eligibility system with policy-driven behavior from Admin settings, and ensure Registration and Login remain consistent after demographic unification.

THIS DOCUMENT IS THE SOURCE OF TRUTH.
If code behavior differs, fix code or update this directive immediately.

──────────────────────────────────────────────────────────────
3-LAYER ARCHITECTURE
──────────────────────────────────────────────────────────────
Layer 1: Directive (What to do)

- Specs in Markdown, live in directives/
- Defines goals, UI/UX, features, constraints, contracts, and security posture
- Updated whenever we discover drift, regressions, or better flows

Layer 2: Orchestration (Decision making)

- The Agent reads directives, inspects repo, chooses minimal changes, plans work
- Detects platform differences (Docker vs local, emulator vs device)
- Produces reports: what changed, why, how to verify, rollback notes

Layer 3: Execution (Doing the work)

- Deterministic code locations:
  - Flutter: mobile/lib/, assets: mobile/assets/
  - Backend: backend/src/ (and backend/dist/ only if deployment uses it)
  - Admin: admin/src/
  - Infra: docker-compose.yml, migrations: backend/db/migrations/, env templates
- No “magic fixes” without verification steps

──────────────────────────────────────────────────────────────
OPERATING PRINCIPLES
──────────────────────────────────────────────────────────────
#1 Check tools and existing code first

- Before writing code: scan pubspec.yaml, backend routes/services, admin client, migrations
- Identify existing endpoints and data contracts
- Prefer minimal patch over refactor

#2 Self-anneal when things break

- Read the error
- Fix the root cause (not symptoms)
- Add verification (curl/SQL/UI)
- Update directive so the same issue can’t return

#3 Directives are living documents

- If reality differs from directive, update one of them
- If “unification” changes contracts, update the contract sections here immediately

──────────────────────────────────────────────────────────────
NON-NEGOTIABLES (HARD RULES)
──────────────────────────────────────────────────────────────

- SOURCE OF TRUTH: Backend. Mobile is untrusted.
- CHANGES: Minimal targeted changes only. No big refactors unless explicitly authorized.
- UI/UX: Premium, consistent with existing themes. Clear progress, clear states.
- ERRORS: No silent failures. Always show toast/banner with actionable retry.
- PROVIDERS: Mock/dev providers disabled in production (explicit gating).
- RATE LIMITING: Basic rate limiting for auth/enrollment endpoints.
- LOGGING: Log verification attempts (no raw images). Store hashes/metadata only.
- DOCKER ENV: Never override docker-compose env with local .env in containers.
  (No dotenv override:true in backend startup.)

──────────────────────────────────────────────────────────────
CANONICAL DATA CONTRACTS (UNIFICATION RULES)
──────────────────────────────────────────────────────────────

1. Canonical Region Identifier

- The ONLY canonical region identifier is region_code (string).
- It MUST match DB regions.code exactly.
- UUID region IDs may be accepted as input temporarily, but MUST be normalized to region_code immediately.
- IMPORTANT: Do not introduce a second region-code format. Use what DB provides.

2. Canonical Demographics Shape (Bucketed + Minimal)
   All demographics used for eligibility/analytics MUST be bucketed and minimal:

{ "region": "<region_code>", "age_bucket": "25-34", "gender": "M" }

- No unique IDs, no device hashes, no credential subject
- No full credential blobs in votes.demographics_snapshot
- Keys MUST be stable across mobile/admin/backend (region, age_bucket, gender)

3. Token Model Must Preserve Unified Demographics

- A user’s credential context MUST NOT regress after Login.
- Registration and Login MUST produce equivalent demographic context, derived from DB source-of-truth.

──────────────────────────────────────────────────────────────
SESSION & AUTH TOKENS (BEST PRACTICE)
──────────────────────────────────────────────────────────────

- credentialToken: long-lived token used for protected API calls (polls, messages, voting, wallet)
- sessionAttestation: short-lived token (if used) MUST NOT replace credentialToken for general API auth

Mobile MUST:

- store credentialToken securely
- inject it as Bearer token into all protected calls
- handle 401 by re-auth/re-login gracefully

Regression rule:
If Login issues a token without demographics (region/age/gender), the system is broken.

──────────────────────────────────────────────────────────────
A) STRICT ENROLLMENT (POLICY-DRIVEN) — PREMIUM FLOW
──────────────────────────────────────────────────────────────
Step 0: Fetch Policy + Start Session

- Mobile on startup and on enrollment entry:
  GET /api/v1/settings/verification
- Backend returns policy + provider configuration

Step 1: NFC Scan (Real NFC Session)

- Mandatory if policy requires NFC
- Backend checks personalNumber -> mode="login" or mode="register"
- Backend maps any birthplace/region hint only if reliable; normalize to region_code
- Output: enrollmentSessionId, mode, requiredSteps[] (derived from policy)

Step 2: Region Selection (MUST exist when needed)

- After NFC (especially for register), user must choose region if:
  - region unknown OR policy requires explicit confirmation
- Mobile calls:
  GET /api/v1/enrollment/regions
- UI must show list; failure must show actionable error + retry

Backend rules:

- /enrollment/regions must never 500 due to schema drift
- DB must have unified regions schema

Step 3: Document Scan + Compare (if required)

- Policy: requireDocumentPhotoScan
- Capture doc photo, send to backend
- Backend compares NFC vs doc: PN, DOB, Expiry, DocNum
- Standard errors:
  NFC_DOC_MISMATCH, DOC_PHOTO_REQUIRED, DOC_EXPIRED, PN_MISSING, NOT_GEO

Step 4: Liveness + Face Match

- Provider-driven (FaceTec/iProov/AWS/etc.)
- Result: credentialToken returned only if requirements satisfied

──────────────────────────────────────────────────────────────
B) ADMIN (POLICY CONTROL — DEV-FRIENDLY)
──────────────────────────────────────────────────────────────
Admin is for development/testing. Do NOT add heavy RBAC unless explicitly requested.

Verification Providers / Policies:

- NFC: Real / Mock (mock disabled in prod)
- Document Scan: Manual / OCR
- Liveness: Provider selection
- Face Match: Provider selection
- Thresholds/strictness toggles
- Citizenship rule: requireGeorgianCitizen

Configuration integrity:

- Admin provider options MUST match backend supported provider enums exactly
- Backend must validate settings; clear error if misconfigured

──────────────────────────────────────────────────────────────
C) REGIONS & MIGRATIONS — SOURCE-OF-TRUTH RULES
──────────────────────────────────────────────────────────────
Migration source-of-truth:

- Only backend/db/migrations/ is authoritative.
- Legacy migrations elsewhere must be deprecated (not used at runtime).

Regions schema (canonical):

- regions.id (uuid), regions.code (text), regions.name_en, regions.name_ka, active, parent_region_id, timestamps

Schema drift prevention:

- If legacy regions table exists, migration must:
  - rename legacy to regions_legacy (preserve data)
  - create unified regions
  - seed canonical regions only if empty
  - be idempotent

──────────────────────────────────────────────────────────────
D) LOGIN MUST USE UNIFIED DEMOGRAPHICS (CRITICAL REGRESSION GUARD)
──────────────────────────────────────────────────────────────
Backend login rule:

- For existing users:
  - Load stored demographics from DB (region_code, gender, birth_year/age_bucket)
  - Normalize to canonical bucketed shape
  - Issue credentialToken containing canonical demographics
- If login request includes demographics:
  - normalize to region_code and persist updates safely

Mobile login rule:

- Always store and use credentialToken for:
  polls, messages, voting
- Do not mistakenly use short-lived session tokens for general API auth

──────────────────────────────────────────────────────────────
E) PRIVACY MODEL (BALLOT SECRECY + ANALYTICS SAFETY)
──────────────────────────────────────────────────────────────
Unlinkable ballot rules:

- Votes/ballots contain NO identity fields
- “Who voted” tracked separately:
  poll_participants(poll_id, user_id, participated_at)
- demographics_snapshot bucketed only, no identifiers

k-anonymity:

- If totalVotes < poll.min_k_anonymity -> suppress FULL results
- If any demographic bucket count < min_k -> suppress that bucket
- Reduce timing correlation:
  bucket timestamps into windows and/or batching

──────────────────────────────────────────────────────────────
F) STABILITY / RESILIENCE (ALL SERVICE CONNECTIONS)
──────────────────────────────────────────────────────────────
Requirements:

- Hard timeouts on all HTTP clients (mobile/admin/backend)
- Retry only safe operations with exponential backoff + jitter
- Circuit breaker for flaky dependencies (biometric/provider services)
- Redis reconnect strategy + command timeouts
- Health checks:
  /health includes DB + Redis + provider health (or degraded status)

──────────────────────────────────────────────────────────────
G) MOBILE REQUIREMENTS (PREMIUM UX)
──────────────────────────────────────────────────────────────

- Startup: fetch policy from GET /api/v1/settings/verification
- Premium progress UI: NFC → Region → Doc → Liveness
- Respect policy:
  - manual doc entry skips MRZ
  - requireGeorgianCitizen enforced early
- Dev support:
  flutter run --dart-define=API_BASE_URL=...
- Secure storage:
  credentialToken persist/restore
  handle expired token/401 gracefully

──────────────────────────────────────────────────────────────
H) SECURITY & OPS
──────────────────────────────────────────────────────────────

- Backend is source-of-truth
- Mock disabled in prod
- Rate limit auth/enrollment
- Structured logs (no raw images)
- Audit logs for verification attempts and admin settings changes
- Payload limits for images/selfies; avoid base64 in headers

──────────────────────────────────────────────────────────────
VERIFICATION CHECKLIST (MUST PASS BEFORE RELEASE)
──────────────────────────────────────────────────────────────

1. Docker: backend connects to DB + Redis (no localhost drift)
2. GET /health returns OK/degraded with dependency status
3. GET /api/v1/enrollment/regions returns 200 and non-empty list
4. Registration -> credentialToken contains canonical demographics (region uses region_code from DB)
5. Logout -> Login -> credentialToken STILL contains canonical demographics (no regression)
6. Polls + messages behave identically after registration and after login
7. votes.demographics_snapshot contains allowlisted bucketed keys only
8. Results suppressed when totalVotes < k and small buckets suppressed

──────────────────────────────────────────────────────────────
DEFINITION OF DONE
──────────────────────────────────────────────────────────────

- Registration and Login produce consistent credential context (canonical demographics).
- Policies drive enrollment flow without broken screens.
- Regions schema unified and never causes 500.
- Privacy + k-anonymity enforced.
- All service connections bounded by timeouts, retries, and health checks.
- Admin remains dev-friendly and functional without heavy restrictions.
