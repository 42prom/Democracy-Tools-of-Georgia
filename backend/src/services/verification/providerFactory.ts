import { ILivenessProvider, IFaceMatchProvider } from './types';
import { RemoteLivenessProvider, RemoteFaceMatchProvider } from './remoteProviders';
import { InHouseLivenessProvider, InHouseFaceMatchProvider } from './inHouseProviders';

export class VerificationProviderFactory {
  static getLivenessProvider(provider: string): ILivenessProvider {
    switch (provider) {
      case '3d_face_detector':
      case 'in_house': // Legacy support during migration
        console.log('[ProviderFactory] Using 3D Face Detector (local biometric service)');
        return new InHouseLivenessProvider();
      case 'facetec':
      case 'iproov':
      case 'onfido':
        return new RemoteLivenessProvider(provider);
      default:
        console.error(`[ProviderFactory] Unknown or removed liveness provider: ${provider}. Defaulting to 3D Face Detector.`);
        return new InHouseLivenessProvider();
    }
  }

  static getFaceMatchProvider(provider: string): IFaceMatchProvider {
    switch (provider) {
      case 'custom_biometric_matcher':
      case 'in_house': // Legacy support during migration
        console.log('[ProviderFactory] Using Custom Biometric Matcher (InsightFace via local service)');
        return new InHouseFaceMatchProvider();
      case 'aws-rekognition':
      case 'azure-face':
      case 'face-plusplus':
        return new RemoteFaceMatchProvider(provider);
      default:
        console.error(`[ProviderFactory] Unknown or removed face match provider: ${provider}. Defaulting to Custom Biometric Matcher.`);
        return new InHouseFaceMatchProvider();
    }
  }
}
