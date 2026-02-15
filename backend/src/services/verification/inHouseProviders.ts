import { IFaceMatchProvider, ILivenessProvider, VerificationResult } from './types';
import { HttpClientFactory } from '../../utils/httpClient';
import { SettingsService } from '../settingsService';

/**
 * In-House Liveness Provider
 *
 * Liveness is PASS/FAIL only - it confirms the person is real (can blink, move head).
 * It does NOT compute or return a score.
 * Liveness verification happens on the client (mobile app) via camera analysis.
 * This server-side check only verifies a face is present in the selfie.
 */
export class InHouseLivenessProvider implements ILivenessProvider {
  async verify(selfie: Buffer, _apiKey?: string): Promise<VerificationResult> {
    console.log('[InHouseLiveness] Starting liveness verification...');
    console.log(`  Selfie size: ${selfie.length} bytes`);

    try {
      const client = HttpClientFactory.getBiometricClient();
      const selfieBase64 = selfie.toString('base64');

      // Check that a face is detectable in the selfie
      // The actual liveness (blink, movement) is verified client-side
      console.log('[InHouseLiveness] Calling biometric service /verify endpoint...');
      const response = await client.post<{
        match: boolean;
        score: number;
        error?: string;
        faces_detected?: number[];
      }>('/verify', {
        image1_base64: selfieBase64,
        image2_base64: selfieBase64
      });

      const facesDetected = response.data.faces_detected?.[0] || 0;
      console.log(`[InHouseLiveness] Faces detected: ${facesDetected}`);

      if (facesDetected === 0) {
        console.log('[InHouseLiveness] FAIL - No face detected');
        return {
          success: false,
          error: 'No face detected in selfie',
          isRetryable: true
        };
      }

      // Liveness passed - face is present
      // No score returned (liveness is pass/fail only)
      console.log('[InHouseLiveness] PASS - Face detected, liveness confirmed');
      return {
        success: true,
        message: 'Liveness check passed',
        isRetryable: false
      };
    } catch (error: any) {
      console.error('[InHouseLiveness] ERROR:', error.message);
      if (error.code === 'ECONNREFUSED') {
        console.error('[InHouseLiveness] Biometric service not running!');
      }
      return {
        success: false,
        error: error.message || 'Biometric service unavailable',
        isRetryable: true
      };
    }
  }
}

/**
 * In-House Face Match Provider
 * Uses local biometric service (InsightFace) for face matching
 * with automatic image normalization for consistent results across devices
 */
export class InHouseFaceMatchProvider implements IFaceMatchProvider {
  async match(selfie: Buffer, docPortrait: Buffer, _apiKey?: string): Promise<VerificationResult> {
    try {
      const client = HttpClientFactory.getBiometricClient();

      // Convert to base64
      const selfieBase64 = selfie.toString('base64');
      const docBase64 = docPortrait.toString('base64');

      console.log('[InHouseFaceMatch] Calling biometric service with normalization...');
      console.log(`  Selfie size: ${selfie.length} bytes`);
      console.log(`  Document size: ${docPortrait.length} bytes`);

      // Call biometric service with normalization enabled
      // This handles zoom/crop/quality differences across devices
      const response = await client.post<{
        match: boolean;
        score: number;
        threshold: number;
        error?: string;
        faces_detected?: number[];
        latency_ms?: number;
        normalization?: {
          image1_quality: number;
          image2_quality: number;
          normalized: boolean;
        };
      }>('/verify-normalized', {
        image1_base64: selfieBase64,
        image2_base64: docBase64,
        normalize: true
      });

      console.log('[InHouseFaceMatch] Service response:', {
        match: response.data.match,
        score: response.data.score?.toFixed(3),
        threshold: response.data.threshold,
        faces: response.data.faces_detected,
        latency: response.data.latency_ms,
        normalization: response.data.normalization
      });

      const { score, error, faces_detected } = response.data;

      if (error) {
        return {
          success: false,
          score: 0,
          error,
          isRetryable: true
        };
      }

      // Check if faces were detected in both images
      if (faces_detected) {
        if (faces_detected[0] === 0) {
          return {
            success: false,
            score: 0,
            error: 'No face detected in selfie',
            isRetryable: true
          };
        }
        if (faces_detected[1] === 0) {
          return {
            success: false,
            score: 0,
            error: 'No face detected in document photo',
            isRetryable: false
          };
        }
      }

      
      // Get dynamic threshold from settings service
      const threshold = await SettingsService.getBiometricThreshold();
      const isMatch = score >= threshold;

      return {
        success: isMatch,
        score: score || 0,
        message: isMatch
          ? `Face match successful (${(score * 100).toFixed(1)}% similarity)`
          : `Face match failed (${(score * 100).toFixed(1)}% similarity - threshold: ${threshold})`,
        isRetryable: !isMatch && score > (threshold - 0.1)  // Allow retry if close
      };
    } catch (error: any) {
      console.error('[InHouseFaceMatch] Error calling biometric service:', error.message);

      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        return {
          success: false,
          score: 0,
          error: 'Biometric service is not running. Please start it with: cd biometric-service && python main.py',
          isRetryable: false
        };
      }

      return {
        success: false,
        score: 0,
        error: error.message || 'Biometric service error',
        isRetryable: true
      };
    }
  }
}
