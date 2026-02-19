CORE GOAL
Users must NOT manually type passport/ID data. We must automatically read it from the document’s NFC chip and enforce validation rules. Manual entry is fallback ONLY if NFC fails.

SYSTEM OVERVIEW (MUST)
Implement a single unified flow:

1. Camera MRZ scan (auto-detect MRZ type TD3 vs TD1)
2. MRZ validation (check digits) + normalization
3. NFC secure read (PACE if available, else BAC) using MRZ-derived keys
4. Read chip data groups, parse fields, and fill form (read-only)
5. Face match: chip portrait (DG2) vs live selfie after liveness
6. Region selection: only manual field, searchable dropdown matching app design
7. If document expired / liveness fails / face mismatch → block register/login (or route to manual review if product policy allows)

DATA WE MUST EXTRACT FROM NFC CHIP

- Expiry date (MUST) → if expired, block registration/login
- Birth date (MUST) → compute age
- Gender (MUST)
- Personal number (MUST if present; otherwise show “not available” and apply fallback policy)
- Face image from chip (DG2) (MUST) → used for comparison with live selfie

NFC TECH REQUIREMENTS (MUST)

- Do NOT read only NDEF/UID; we must read real eMRTD/eID data (ICAO 9303 style).
- Implement auto-detect:
  - If EF.CardAccess exists → run PACE
  - Else → run BAC
- After secure session established:
  - Read DG1 (MRZ data)
  - Read DG2 (portrait photo)
  - Try DG11/DG13 (optional personal details) to locate personal number when available
  - Read EF.SOD for optional authenticity verification (Passive Auth) if we support it
- Ensure DG2 image decoding supports common formats (JPEG and JPEG2000). If decode fails → treat as scan failure and prompt re-scan.

CAMERA UX: OPTION A AUTO-DETECT (MUST)
Build one camera scanner that:

- Detects MRZ block and auto-classifies:
  - 2 lines → Passport TD3
  - 3 lines → ID TD1
- Uses a consistent overlay with corner brackets, darkened background, and a scan window.
- Auto-captures when MRZ is sharp and fully visible (no shutter press required).
- Shows short live hints:
  - “Move closer”, “Too dark”, “Remove glare”, “Hold steady”, “MRZ not fully in frame”
- Shows a confirmation screen:
  - Extracted MRZ fields (document number, DOB, expiry) read-only
  - Status: “MRZ valid (check digits OK)” or “Invalid MRZ → rescan”
- Only proceed to NFC if MRZ passes check digits.

BUSINESS RULES (MUST)

- Expiry date < today → block register/login with clear message
- Birth date → compute age automatically
- Gender + personal number + expiry + DOB are READ-ONLY after NFC success
- Face verification:
  - Selfie must be from live liveness check (not gallery)
  - If liveness fails → block
  - If chip-photo vs selfie face match fails → block (or manual review if allowed)
- Manual entry fallback appears ONLY when NFC fails (unsupported device, repeated read failure, missing required chip fields per policy)

REGION FIELD (ONLY MANUAL INPUT)

- A dropdown list with built-in search (type-to-filter), optimized for long lists.
- UI must match the application design system (fonts, spacing, radii, colors, button styles).
- Must show “No results” state, and support smooth scrolling.

RELIABILITY + DEBUGGING (MUST)
Add structured logs/telemetry for each stage:

- MRZ detection confidence + check-digit pass/fail
- Chosen NFC path: PACE or BAC
- APDU status words on failures
- DG1/DG2/DG11 read success/fail
- DG2 decode success/fail
- Final extracted fields present/missing
  Provide user-facing error states with actionable retry tips.

SECURITY + PRIVACY (MUST)

- Do not store raw images longer than needed. Prefer ephemeral processing.
- If storing any biometric/template, encrypt and document retention policy.
- Never allow gallery photo for liveness step.
- Show a short notice/consent about using document chip photo + live selfie for verification.

DELIVERABLES

- Code changes replacing current manual flow
- UI screens: MRZ scanner, MRZ confirm, NFC guidance, region dropdown, error states
- Unit tests for MRZ parsing + check digits + normalization
- Integration tests for NFC session flow (PACE/BAC) where possible
- A clear “happy path” and “fallback path” spec + acceptance tests checklist

## UI Overlay Patterns (Transparent PNG)

**ID back overlay**
![ID Back Overlay](docs/assets/pattern_id_back_mrz_overlay.png)

**Passport MRZ overlay (TD3, 2 lines)**
![Passport MRZ Overlay](docs/assets/pattern_passport_mrz_overlay.png)
