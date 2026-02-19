/**
 * Enhanced Security Events Response Type
 */
export interface SecurityEvent {
  eventType: string;
  severity: 'info' | 'warning' | 'error';
  count: number;
  firstSeen: string;
  lastSeen: string;
  biometricScores?: {
    faceMatch: {
      avg: string | null;
      min: string | null;
      max: string | null;
    };
    liveness: {
      avg: string | null;
      min: string | null;
      max: string | null;
    };
  };
}

export interface SecurityEventsSummary {
  total: number;
  events: SecurityEvent[];
  metadata: {
    kThreshold: number;
    suppressedEvents: number;
    timeRange: {
      start: string;
      end: string;
    };
  };
}
