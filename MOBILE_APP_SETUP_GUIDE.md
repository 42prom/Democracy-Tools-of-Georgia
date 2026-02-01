# Mobile App Setup & Verification Provider Configuration Guide

## Issues Found & Solutions

### **Issue 1: Mobile App Connection Error** ❌

**Error Message**:
```
Authentication failed: ClientException with SocketException:
Connection refused (OS Error: Connection refused, errno = 111,
address = localhost, port = 50066, url=http://localhost:3000/api/v1/auth/login-or-enroll
```

**Root Cause**:
The mobile app is configured to connect to `localhost:3000`, which doesn't work because:
- `localhost` on a mobile device points to the mobile device itself, NOT your backend server
- The backend server is running on your development machine, not on the mobile device

**Solution**:

1. **Find your backend server IP address**:
   ```bash
   # On Windows
   ipconfig
   # Look for "IPv4 Address" under your network adapter (e.g., 192.168.1.100)

   # On Mac/Linux
   ifconfig
   # or
   hostname -I
   ```

2. **Update mobile app configuration**:
   - Locate the mobile app's API configuration file (usually `lib/config/api_config.dart` or similar)
   - Change from:
     ```dart
     static const String baseUrl = 'http://localhost:3000';
     ```
   - To:
     ```dart
     static const String baseUrl = 'http://192.168.1.100:3000';  // Use YOUR actual IP
     ```

3. **Verify backend is accessible**:
   ```bash
   # From your mobile device or another computer on the same network
   curl http://YOUR_IP:3000/health

   # Should return:
   # {"status":"ok","timestamp":"...","services":{"database":"connected","redis":"connected"}}
   ```

4. **Firewall Configuration**:
   - Ensure Windows Firewall allows incoming connections on port 3000
   - Or add firewall rule:
     ```powershell
     # Run as Administrator
     New-NetFirewallRule -DisplayName "DTFG Backend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
     ```

---

### **Issue 2: Mock Verification Bypassing Actual Checks** ⚠️

**Problem**:
The mobile app shows "Comparing with document photo" but you didn't:
- Scan any passport/ID document
- Take a selfie
- Perform liveness check (head nod)

Yet it shows:
- Liveness score: 74.4% ✓
- Face Match score: 99.1% ✓

**Root Cause**:
The mobile app is using **mock biometric providers** that auto-pass without real verification. This is **intentional for Phase 0/MVP** testing but **NOT production-ready**.

**Current Behavior** (Mock Mode):
```dart
// Mobile app code (simplified)
BiometricCheck mockLiveness() {
  return BiometricCheck(
    passed: true,        // Always passes!
    score: Random().nextDouble() * 0.3 + 0.7  // Random 70-100%
  );
}

BiometricCheck mockFaceMatch() {
  return BiometricCheck(
    passed: true,        // Always passes!
    score: Random().nextDouble() * 0.2 + 0.8  // Random 80-100%
  );
}
```

**Why This Happens**:
1. Backend is correctly configured to use "Mock (MVP)" providers in Settings
2. Mobile app respects this and uses mock implementations
3. Mock providers bypass actual biometric capture for faster development
4. Backend validates the flags sent by mobile app (which are always `passed: true` in mock mode)

**Solution for Production**:

#### A. Configure Real Verification Providers in Admin Settings

Navigate to: **Settings > Verification Providers**

1. **Document Scanner**:
   - Change from "Manual Entry (MVP)" to:
     - **NFC Passport Scanner** (recommended for Georgian biometric passports)
     - **OCR Document Scanner** (for ID cards without NFC)
   - Add provider API key

2. **Liveness Verification**:
   - Change from "Mock (MVP)" to:
     - **FaceTec SDK** (industry standard, best anti-spoofing)
     - **iProov** (excellent for government use)
     - **Onfido** (full identity verification platform)
   - Add provider API key
   - Set minimum score threshold (recommended: 0.75-0.85)

3. **Face Matching**:
   - Change from "Mock (MVP)" to:
     - **AWS Rekognition** (scalable, reliable)
     - **Azure Face API** (Microsoft cloud)
     - **Face++** (high accuracy)
   - Add provider API key
   - Set minimum score threshold (recommended: 0.80-0.90)

#### B. Update Mobile App to Use Real Providers

Once admin settings are configured, update mobile app:

```dart
// lib/services/biometric_service.dart

class BiometricService {
  Future<BiometricCheck> performLiveness() async {
    // OLD (Mock):
    // return BiometricCheck(passed: true, score: 0.85);

    // NEW (Real FaceTec SDK):
    final faceTecResult = await FaceTecSDK.authenticate();
    return BiometricCheck(
      passed: faceTecResult.wasSuccessful,
      score: faceTecResult.livenessScore,
      challenge: 'nod_head',
      timestamp: DateTime.now().toIso8601String()
    );
  }

  Future<BiometricCheck> performFaceMatch(
    File documentPhoto,
    File selfie
  ) async {
    // Call backend API with real photos
    final response = await http.post(
      '$baseUrl/api/v1/verify/face-match',
      body: {
        'documentPhoto': base64Encode(documentPhoto.readAsBytesSync()),
        'selfie': base64Encode(selfie.readAsBytesSync()),
      }
    );

    return BiometricCheck(
      passed: response.data['passed'],
      score: response.data['score'],
    );
  }
}
```

---

### **Issue 3: Settings UI Best Practices** ✅

**Current State**: Settings page is functional but could be more informative.

**Improvements Made**:
1. ✅ Added warning banner when using mock providers
2. ✅ Added descriptions for each verification type
3. ✅ Existing features already production-ready:
   - Save/Cancel buttons with change detection
   - Test Connection functionality
   - Eye icons to show/hide API keys
   - Proper validation and error handling

**Additional Production Recommendations**:

1. **Environment Indicator**:
   - Add banner showing "Development" or "Production" mode
   - Different colors: Yellow for dev, Red for prod with mock providers

2. **Provider Documentation Links**:
   ```tsx
   const PROVIDER_DOCS = {
     'facetec': 'https://dev.facetec.com/docs',
     'iproov': 'https://docs.iproov.com',
     'aws-rekognition': 'https://docs.aws.amazon.com/rekognition',
   };
   ```

3. **Cost Estimates**:
   - Show estimated cost per verification based on provider
   - Help admins choose cost-effective solutions

4. **Compliance Badges**:
   - Show which providers are GDPR/SOC2 compliant
   - Important for government use

---

## Production Deployment Checklist

### Backend Configuration

- [ ] Update `DATABASE_URL` to production database
- [ ] Update `REDIS_URL` to production Redis
- [ ] Set strong `JWT_SECRET` (64+ random characters)
- [ ] Set strong `PN_HASH_SECRET` (64+ random characters)
- [ ] Set `NODE_ENV=production`
- [ ] Configure SSL/TLS certificates
- [ ] Set `CORS_ORIGIN` to actual domain
- [ ] Configure verification provider API keys

### Mobile App Configuration

- [ ] Update `baseUrl` to production API (e.g., `https://api.dtfg.ge`)
- [ ] Integrate real NFC passport scanner SDK
- [ ] Integrate real liveness detection SDK (FaceTec/iProov)
- [ ] Remove all mock/bypass code
- [ ] Enable certificate pinning for API security
- [ ] Add proper error handling for network failures
- [ ] Test on physical devices (not emulators)

### Admin Panel Configuration

- [ ] Change all verification providers from Mock/Manual to real providers
- [ ] Add all required API keys
- [ ] Test each provider's connection
- [ ] Set appropriate score thresholds
- [ ] Configure rate limiting
- [ ] Enable production security settings

### Security Checklist

- [ ] No mock providers in production
- [ ] All API keys encrypted at rest
- [ ] HTTPS enforced (no HTTP)
- [ ] Database credentials not in code
- [ ] Rate limiting enabled
- [ ] Audit logging configured
- [ ] Backup strategy in place
- [ ] Incident response plan documented

---

## Testing Verification Flow

### Phase 1: Mock Testing (Current)

```bash
# Test with mock providers (current setup)
curl -X POST http://localhost:3000/api/v1/auth/login-or-enroll \
  -H "Content-Type: application/json" \
  -d '{
    "pnDigits": "12345678901",
    "liveness": {"passed": true, "score": 0.85},
    "faceMatch": {"passed": true, "score": 0.92},
    "gender": "M",
    "birthYear": 2002,
    "regionCodes": ["reg_tbilisi"]
  }'
```

### Phase 2: Real Testing (Production)

1. **Document Scan**: Mobile app uses NFC to read passport chip
2. **Liveness Check**: User performs head nod/blink in front of camera
3. **Face Match**: Backend compares selfie with passport photo
4. **Result**: Only passes if ALL checks pass with score > threshold

---

## Support & Troubleshooting

### Common Errors

**"Connection refused"**
- Mobile app has wrong backend URL
- Backend not accessible from mobile device network
- Firewall blocking port 3000

**"Liveness check failed"**
- Score below minimum threshold
- Mock provider still active
- Poor lighting conditions (if using real provider)

**"Face match check failed"**
- Photos don't match
- Mock provider still active
- Document photo not extracted correctly

### Getting Help

1. Check backend logs: `C:\Users\nakem\AppData\Local\Temp\claude\c--Users-nakem-OneDrive-Desktop-antygravity\tasks\b668c45.output`
2. Check mobile app logs in development console
3. Test each provider independently using "Test Connection" button
4. Verify API keys are correct and not expired

---

## Next Steps

1. **Immediate**: Fix mobile app backend URL to use your machine's IP address
2. **Phase 1**: Continue testing with mock providers for development
3. **Phase 2**: Sign up for real verification provider accounts (FaceTec, AWS, etc.)
4. **Phase 3**: Integrate real SDKs into mobile app
5. **Phase 4**: Configure production providers in admin settings
6. **Production**: Remove all mock code and deploy

---

**Last Updated**: 2026-01-30
**Environment**: Development (Mock Providers Active)
**Status**: ⚠️ Not Production Ready
