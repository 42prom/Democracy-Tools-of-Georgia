import { pool } from '../db/client';

export interface BiometricResult {
  score: number;
  tier: 1 | 2 | 3;
  allowed: boolean;
  message?: string;
  isRetryable: boolean;
}

/**
 * Biometric Service
 * Handles face matching logic and IP-based rate limiting
 */
export class BiometricService {
  /**
   * Check if an IP is currently blocked due to biometric failures
   */
  static async checkRateLimit(ip: string): Promise<{ allowed: boolean; reason?: string }> {
    const result = await pool.query(
      'SELECT retry_count, reject_count, locked_until, lockout_reason FROM ip_biometric_limits WHERE ip_address = $1',
      [ip]
    );

    if (result.rows.length === 0) {
      return { allowed: true };
    }

    const { locked_until, lockout_reason } = result.rows[0];

    if (locked_until && new Date(locked_until) > new Date()) {
      return {
        allowed: false,
        reason: lockout_reason || `Blocked until ${new Date(locked_until).toISOString()}`
      };
    }

    // Double check specific counts just in case (Tier 3: 3 rejects, Tier 2: 5 retries)
    // FIX: Do not block solely on count if lock has expired. 
    // The "locked_until" field is the source of truth for active blocks.
    
    /* 
    if (reject_count >= 3) {
      return { allowed: false, reason: 'Strict rejection limit reached (3/3). IP blocked.' };
    }
    if (retry_count >= 5) {
      return { allowed: false, reason: 'Maximum retry attempts reached (5/5). IP blocked.' };
    }
    */

    return { allowed: true };
  }

  /**
   * Record a biometric attempt and update IP limits
   */
  static async recordAttempt(ip: string, score: number): Promise<void> {
    const tier = this.getTier(score);
    
    // Tier 1 (Auto-Accept) doesn't count against limits, it resets them if they pass eventually
    if (tier === 1) {
      await pool.query('DELETE FROM ip_biometric_limits WHERE ip_address = $1', [ip]);
      return;
    }

    // Fetch dynamic rate limits from system_settings
    let maxRejections = 3;
    let maxRetries = 5;
    let windowMinutes = 60;

    try {
      const { SettingsService } = require('./settingsService');
      const config = await SettingsService.get('rate_limit_biometric', { ip: 3, account: 5, window: 60 });
      maxRejections = config.ip || 3;
      maxRetries = config.account || 5;
      windowMinutes = config.window || 60;
    } catch (err) {
      console.error('[BiometricService] Failed to load dynamic rate limits, using defaults:', err);
    }

    const isReject = tier === 3;
    const isRetry = tier === 2;

    await pool.query(
      `INSERT INTO ip_biometric_limits (ip_address, retry_count, reject_count, last_attempt_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (ip_address)
       DO UPDATE SET
         retry_count = ip_biometric_limits.retry_count + $2,
         reject_count = ip_biometric_limits.reject_count + $3,
         last_attempt_at = NOW(),
         locked_until = CASE
           WHEN ip_biometric_limits.reject_count + $3 >= $4 THEN NOW() + ($6 || ' minutes')::INTERVAL
           WHEN ip_biometric_limits.retry_count + $2 >= $5 THEN NOW() + '15 minutes'::INTERVAL
           ELSE ip_biometric_limits.locked_until
         END,
         lockout_reason = CASE
           WHEN ip_biometric_limits.reject_count + $3 >= $4 THEN 'Max strict rejections (' || $4 || '/' || $4 || ')'
           WHEN ip_biometric_limits.retry_count + $2 >= $5 THEN 'Max total retries (' || $5 || '/' || $5 || ')'
           ELSE ip_biometric_limits.lockout_reason
         END`,
      [ip, isRetry ? 1 : 0, isReject ? 1 : 0, maxRejections, maxRetries, windowMinutes]
    );
  }


  /**
   * Process a verification attempt via Strategy Pattern
   * Uses in-house biometric service for liveness + face matching
   */
  static async verify(ip: string, selfie: Buffer, docPortrait: Buffer): Promise<BiometricResult> {
    console.log('\n========================================');
    console.log('[BiometricService] Starting verification');
    console.log('========================================');
    console.log(`  IP: ${ip}`);
    console.log(`  Selfie size: ${selfie.length} bytes`);
    console.log(`  Doc portrait size: ${docPortrait.length} bytes`);

    // 1. Check Rate Limit
    console.log('\n[BiometricService] Step 1: Checking rate limit...');
    const rate = await this.checkRateLimit(ip);
    if (!rate.allowed) {
      console.log(`  BLOCKED: ${rate.reason}`);
      return { score: 0, tier: 3, allowed: false, message: rate.reason, isRetryable: false };
    }
    console.log('  Rate limit: PASSED');

    // 2. Fetch Settings & Instantiate Providers
    let score = 0.0;
    let minThreshold = 0.8;
    let message = 'Verification failed.';
    let isRetryable = true;

    try {
      console.log('\n[BiometricService] Step 2: Loading settings...');
      const { getVerificationSettings } = require('./verificationSettings');
      const { pool } = require('../db/client');
      const crypto = require('crypto');

      const settings = await getVerificationSettings();
      minThreshold = settings.faceMatch.minThreshold;
      console.log(`  Liveness provider: ${settings.liveness.provider}`);
      console.log(`  Face match provider: ${settings.faceMatch.provider}`);
      console.log(`  Face match threshold: ${minThreshold}`);

      // Fetch decrypted API keys directly from DB for the specific providers
      const keysResult = await pool.query(
        "SELECT key, value FROM settings WHERE key IN ('verification_liveness_apikey', 'verification_facematch_apikey')"
      );
      
      const keysMap: Record<string, string> = {};
      const { getApiKeyEncryptionSecret } = require('../config/secrets');
      const ENCRYPTION_KEY = getApiKeyEncryptionSecret();
      const DERIVED_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

      keysResult.rows.forEach((row: any) => {
        if (row.value) {
          try {
            const parts = row.value.split(':');
            if (parts.length === 2) {
              const iv = Buffer.from(parts[0], 'hex');
              const encryptedText = parts[1];
              const decipher = crypto.createDecipheriv('aes-256-cbc', DERIVED_KEY, iv);
              let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
              decrypted += decipher.final('utf8');
              keysMap[row.key] = decrypted;
            }
          } catch (e) {
            console.error(`[BiometricService] Failed to decrypt ${row.key}:`, e);
          }
        }
      });

      const { VerificationProviderFactory } = require('./verification/providerFactory');

      // We perform both Liveness AND Face Match if configured
      const livenessProvider = VerificationProviderFactory.getLivenessProvider(settings.liveness.provider);
      const faceMatchProvider = VerificationProviderFactory.getFaceMatchProvider(settings.faceMatch.provider);

      // A. Liveness Check
      console.log('\n[BiometricService] Step 3: Liveness verification...');
      console.log(`  Provider: ${settings.liveness.provider}`);
      const livenessResult = await livenessProvider.verify(selfie, keysMap['verification_liveness_apikey']);
      console.log(`  Liveness result: ${livenessResult.success ? 'PASS' : 'FAIL'}`);
      if (livenessResult.message) console.log(`  Message: ${livenessResult.message}`);
      if (!livenessResult.success) {
        console.log('  [ABORT] Liveness check failed, not proceeding to face match');
        return {
          score: livenessResult.score || 0,
          tier: 3,
          allowed: false,
          message: livenessResult.error || 'Liveness check failed',
          isRetryable: livenessResult.isRetryable ?? true
        };
      }

      // B. Face Matching
      console.log('\n[BiometricService] Step 4: Face matching...');
      console.log(`  Provider: ${settings.faceMatch.provider}`);
      const matchResult = await faceMatchProvider.match(selfie, docPortrait, keysMap['verification_facematch_apikey']);
      score = matchResult.score || 0;
      console.log(`  Face match score: ${score.toFixed(3)}`);
      console.log(`  Threshold: ${minThreshold}`);
      console.log(`  Result: ${matchResult.success ? 'PASS' : 'FAIL'}`);
      message = matchResult.message || (matchResult.success ? 'Face match successful' : 'Face match failed');
      isRetryable = matchResult.isRetryable ?? true;

      if (!matchResult.success) {
        console.log('  [ABORT] Face match failed');
        return { score, tier: 3, allowed: false, message, isRetryable };
      }

    } catch (e: any) {
      console.error('[BiometricService] Verification error:', e);
      return { 
        score: 0, 
        tier: 3, 
        allowed: false, 
        message: 'Internal verification error. Please try again later.', 
        isRetryable: true
      };
    }

    const tier = this.getTier(score, minThreshold);
    console.log(`\n[BiometricService] Step 5: Determining tier...`);
    console.log(`  Score: ${score.toFixed(3)} | Threshold: ${minThreshold}`);
    console.log(`  Tier: ${tier} (1=Accept, 2=Retry, 3=Reject)`);

    // 3. Record Attempt
    console.log('\n[BiometricService] Step 6: Recording attempt...');
    await this.recordAttempt(ip, score);

    // 4. Check if we just hit the limit
    const updatedRate = await this.checkRateLimit(ip);
    console.log(`  Updated rate limit: ${updatedRate.allowed ? 'OK' : 'BLOCKED'}`);

    // 5. Return Result
    const allowed = tier === 1;
    const finalIsRetryable = tier === 2 && updatedRate.allowed && isRetryable;

    if (tier === 2) {
      if (!updatedRate.allowed) {
        message = 'Maximum retry attempts reached. Please try again later.';
      } else {
        message = 'Marginal match. Please try again in better lighting.';
      }
    }
    if (tier === 3 && !updatedRate.allowed) {
      message = 'Identity verification failed. IP blocked due to too many low-confidence attempts.';
    }

    console.log('\n========================================');
    console.log('[BiometricService] FINAL RESULT');
    console.log('========================================');
    console.log(`  Allowed: ${allowed}`);
    console.log(`  Score: ${score.toFixed(3)}`);
    console.log(`  Tier: ${tier}`);
    console.log(`  Retryable: ${finalIsRetryable}`);
    console.log(`  Message: ${message}`);
    console.log('========================================\n');

    return { score, tier, allowed, message, isRetryable: finalIsRetryable };
  }

  /**
   * Determine tier based on score
   */
  private static getTier(score: number, minThreshold: number = 0.8): 1 | 2 | 3 {
    if (score >= minThreshold) return 1;
    const retryZone = Math.max(0.4, minThreshold - 0.2);
    if (score >= retryZone) return 2;
    return 3;
  }
}

