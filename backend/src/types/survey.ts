export type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'rating_scale' | 'ranked_choice';

export interface SurveyQuestion {
  id?: string;
  questionText: string;
  questionType: QuestionType;
  required: boolean;
  displayOrder: number;
  config: RatingScaleConfig | TextConfig | RankedChoiceConfig | Record<string, never>;
  options?: QuestionOption[];
}

export interface QuestionOption {
  id?: string;
  optionText: string;
  displayOrder: number;
}

export interface RatingScaleConfig {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface TextConfig {
  maxLength?: number;
  placeholder?: string;
}

export interface RankedChoiceConfig {
  maxRanks?: number;
}

export interface SurveySubmission {
  pollId: string;
  nullifier: string;
  responses: QuestionResponse[];
  demographicsSnapshot: Record<string, any>;
}

export interface QuestionResponse {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  textResponse?: string;
  ratingValue?: number;
  rankedOptionIds?: string[];
}

// Results types
export interface SurveyQuestionResult {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  totalResponses: number;
  results: SingleChoiceResult | MultipleChoiceResult | TextResult | RatingResult | RankedResult;
}

export interface SingleChoiceResult {
  type: 'single_choice';
  options: { optionId: string; optionText: string; count: number | string; percentage?: number }[];
}

export interface MultipleChoiceResult {
  type: 'multiple_choice';
  options: { optionId: string; optionText: string; count: number | string; percentage?: number }[];
}

export interface TextResult {
  type: 'text';
  responseCount: number;
  averageLength: number;
  keywords?: { word: string; count: number }[];
}

export interface RatingResult {
  type: 'rating_scale';
  average: number;
  distribution: { value: number; count: number | string; percentage?: number }[];
  config: RatingScaleConfig;
}

export interface RankedResult {
  type: 'ranked_choice';
  rankings: { optionId: string; optionText: string; weightedScore: number; firstPlaceCount: number | string; percentage?: number }[];
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
