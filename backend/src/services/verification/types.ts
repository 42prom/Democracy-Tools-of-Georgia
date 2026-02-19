export interface VerificationResult {
  success: boolean;
  score?: number;
  message?: string;
  error?: string;
  isRetryable?: boolean;
}

export interface ILivenessProvider {
  verify(selfie: Buffer, apiKey?: string): Promise<VerificationResult>;
}

export interface IFaceMatchProvider {
  match(selfie: Buffer, docPortrait: Buffer, apiKey?: string): Promise<VerificationResult>;
}

export interface IDocumentScanner {
  // Logic for server-side OCR or document validation if needed
  validate(docImage: Buffer, apiKey?: string): Promise<VerificationResult>;
}
