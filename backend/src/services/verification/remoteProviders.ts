import { IFaceMatchProvider, ILivenessProvider, VerificationResult } from './types';

export class MockLivenessProvider implements ILivenessProvider {
  async verify(selfie: Buffer): Promise<VerificationResult> {
    // Simple mock logic: stable based on image size
    const score = 0.7 + ((selfie.length % 300) / 1000);
    return {
      success: score >= 0.7,
      score: Math.min(0.99, score),
      message: 'Mock liveness check complete',
      isRetryable: true
    };
  }
}

export class MockFaceMatchProvider implements IFaceMatchProvider {
  async match(selfie: Buffer, docPortrait: Buffer): Promise<VerificationResult> {
    const sum = selfie.length + docPortrait.length;
    const score = 0.8 + ((sum % 199) / 1000);
    return {
      success: true, // Most matches pass in mock
      score: Math.min(0.99, score),
      message: 'Mock face match complete'
    };
  }
}

export class RemoteLivenessProvider implements ILivenessProvider {
  constructor(private providerName: string) {}

  async verify(_selfie: Buffer, apiKey?: string): Promise<VerificationResult> {
    if (!apiKey && this.providerName !== 'mock') {
      return { success: false, error: 'API Key missing for remote provider', isRetryable: false };
    }
    
    // In Phase 1, we still use stubs that log the provider being used
    console.log(`[Verification] Calling remote liveness provider: ${this.providerName}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // For now, returning mock success to keep enrollment working
    return { success: true, score: 0.95, message: `Validated via ${this.providerName}` };
  }
}

export class RemoteFaceMatchProvider implements IFaceMatchProvider {
  constructor(private providerName: string) {}

  async match(_selfie: Buffer, _docPortrait: Buffer, apiKey?: string): Promise<VerificationResult> {
    if (!apiKey && this.providerName !== 'mock') {
      return { success: false, error: 'API Key missing for remote provider', isRetryable: false };
    }

    console.log(`[Verification] Calling remote face match provider: ${this.providerName}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { success: true, score: 0.92, message: `Matched via ${this.providerName}` };
  }
}
