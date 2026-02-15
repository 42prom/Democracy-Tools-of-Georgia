/**
 * Poll types and interfaces
 */

export type PollStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'archived';
export type PollType = 'election' | 'referendum' | 'survey';

export interface AudienceRules {
  min_age?: number;
  max_age?: number;
  regions?: string[];
  gender?: 'M' | 'F' | 'all';
}

export interface Poll {
  id: string;
  title: string;
  description?: string;
  type: PollType;
  status: PollStatus;
  start_at?: Date;
  end_at?: Date;
  audience_rules: AudienceRules;
  min_k_anonymity: number;
  created_at: Date;
  updated_at: Date;
  published_at?: Date;
  rewards_enabled?: boolean;
  reward_amount?: number;
  reward_token?: string;
}

export interface PollOption {
  id: string;
  poll_id: string;
  text: string;
  display_order: number;
}

export interface CreatePollRequest {
  title: string;
  description?: string;
  type: PollType;
  options: string[];
  questions?: any[]; // For survey type
  audience_rules: AudienceRules;
  start_at?: string;
  end_at?: string;
  rewards_enabled?: boolean;
  reward_amount?: number;
  reward_token?: string;
}

export interface Vote {
  id: string;
  poll_id: string;
  option_id: string;
  demographics_snapshot: any;
  created_at: Date;
}

export interface VoteSubmission {
  pollId: string;
  optionId: string;
  nullifier: string;
  nonce: string;
  signature: string;
  device?: {
    id: string;
    platform?: string;
    provider?: string;
  };
  attestation?: {
    token: string;
  };
}
