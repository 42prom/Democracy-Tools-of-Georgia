export interface LoginRequest {
  email: string;
  password?: string;
}

export interface AuthResponse {
  token: string;
  user: AdminUser;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'moderator' | 'observer';
  fullName?: string;
}

export type PollStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'archived';
export type PollType = 'election' | 'referendum' | 'survey';

export interface AudienceRules {
  min_age?: number;
  max_age?: number;
  regions?: string[];
  gender?: 'M' | 'F' | 'all';
}

export interface PollOption {
  id?: string;
  text: string;
  display_order: number;
}

// Survey question types
export type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'rating_scale' | 'ranked_choice';

export interface SurveyQuestion {
  id?: string;
  questionText: string;
  questionType: QuestionType;
  required: boolean;
  displayOrder: number;
  config: Record<string, any>;
  options?: QuestionOption[];
}

export interface QuestionOption {
  id?: string;
  optionText: string;
  displayOrder: number;
}

export interface Poll {
  id: string;
  title: string;
  description?: string;
  type: PollType;
  status: PollStatus;
  options: PollOption[];
  questions?: SurveyQuestion[];
  referendum_question?: string;
  referendum_threshold?: number;
  election_question?: string;
  audience_rules: AudienceRules;
  start_at?: string;
  end_at?: string;
  published_at?: string;
  created_at: string;
  min_k_anonymity: number;
  rewards_enabled: boolean;
  reward_amount?: number;
  reward_token?: string;
}

export interface CreatePollRequest {
  title: string;
  description?: string;
  type: PollType;
  options?: string[];
  questions?: SurveyQuestion[];
  referendum_question?: string;
  referendum_threshold?: number;
  election_question?: string;
  audience_rules: AudienceRules;
  start_at?: string;
  end_at?: string;
  status?: PollStatus;
  rewards_enabled?: boolean;
  reward_amount?: number;
  reward_token?: string;
}

// Survey results types
export interface SurveyQuestionResult {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  totalResponses: number;
  results: any;
}

export interface SurveyResultsResponse {
  pollId: string;
  totalSubmissions: number;
  questions: SurveyQuestionResult[];
  metadata: {
    kThreshold: number;
    suppressedCells: number;
    lastUpdated: string;
  };
}

export interface AudienceEstimate {
  count: number;
  isPrivacySafe: boolean;
}

export interface Region {
  id: string;
  code: string;
  name_en: string;
  name_ka: string;
  parent_region_id?: string;
  active: boolean;
}

export interface CreateRegionRequest {
  code: string;
  name_en: string;
  name_ka: string;
  parent_region_id?: string;
  active?: boolean;
}

export interface PollResults {
  pollId: string;
  totalVotes: number;
  results: {
    optionId: string;
    optionText: string;
    count: number | string;
    percentage?: number;
  }[];
  breakdowns?: {
    [dimension: string]: {
      dimension: string;
      cohorts: {
        value: string;
        count: number | string;
        percentage?: number;
      }[];
    };
  };
  metadata: {
    kThreshold: number;
    suppressedCells: number;
    lastUpdated: string;
  };
}

export interface SecurityEvent {
  eventType: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  count: number | string;
  firstSeen?: string;
  lastSeen?: string;
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
  total: number | string;
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

// Profiles
export interface UserProfile {
  id: string;
  personalNumber: string; // Masked by default (e.g., "***456789")
  personalNumberMasked: string;
  name?: string;
  surname?: string;
  ageBucket: string; // e.g., "25-34"
  genderBucket: 'M' | 'F' | 'Other';
  regionBucket: string;
  status: 'active' | 'suspended' | 'pending';
  notificationsEnabled: boolean;
  lastLoginAt?: string;
  enrolledAt: string;
}

export interface ProfileFilters {
  search?: string; // Personal number or name/surname
  ageBucket?: string;
  genderBucket?: 'M' | 'F' | 'Other';
  regionBucket?: string;
  lastLoginStart?: string;
  lastLoginEnd?: string;
}

export interface ProfilesResponse {
  profiles: UserProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ExportRequest {
  type: 'aggregated' | 'profile_list';
  filters: ProfileFilters;
}

export interface ExportResponse {
  exportId: string;
  downloadUrl: string;
}

export interface ParticipationRecord {
  pollId: string;
  pollTitle: string;
  participated: boolean; // YES/NO only
  participationDate?: string; // Day-level only
}

// Messages
export type MessageType = 'announcement' | 'alert' | 'reminder';
export type MessageStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface Message {
  id: string;
  title: string;
  body: string;
  type: MessageType;
  status: MessageStatus;
  audience_rules: AudienceRules;
  publish_at?: string;
  expire_at?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface CreateMessageRequest {
  title: string;
  body?: string;
  type: MessageType;
  audience_rules?: AudienceRules;
  publish_at?: string;
  expire_at?: string;
}

// Insights
export interface InsightsDimension {
  dimension: string; // e.g., "ageBucket", "genderBucket", "regionBucket"
  cohorts: {
    value: string;
    count: number | string; // Can be "<k" if suppressed
    percentage?: number;
  }[];
}

export interface InsightsResponse {
  totalUsers: number | string;
  dimensions: InsightsDimension[];
  metadata: {
    kThreshold: number;
    suppressedCells: number;
    queryTimestamp: string;
  };
}
