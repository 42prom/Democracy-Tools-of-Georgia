-- Survey Questions System Migration
-- Adds multi-question survey support with different question types

-- Survey questions table (one survey poll → many questions)
CREATE TABLE IF NOT EXISTS survey_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN (
        'single_choice',
        'multiple_choice',
        'text',
        'rating_scale',
        'ranked_choice'
    )),
    required BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Options for choice-type questions (single_choice, multiple_choice, ranked_choice)
CREATE TABLE IF NOT EXISTS question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    display_order INT DEFAULT 0
);

-- Survey responses (ANONYMOUS - same privacy model as votes)
CREATE TABLE IF NOT EXISTS survey_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id),
    question_id UUID NOT NULL REFERENCES survey_questions(id),

    -- Response data (only one populated per row based on question type)
    selected_option_id UUID REFERENCES question_options(id),
    selected_option_ids UUID[],
    text_response TEXT,
    rating_value INT CHECK (rating_value >= 1 AND rating_value <= 10),
    ranked_option_ids UUID[],

    -- Demographics snapshot for per-question analytics
    demographics_snapshot JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Survey nullifiers (prevent double submission for entire survey)
CREATE TABLE IF NOT EXISTS survey_nullifiers (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    nullifier_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (poll_id, nullifier_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_survey_questions_poll ON survey_questions(poll_id);
CREATE INDEX IF NOT EXISTS idx_survey_questions_order ON survey_questions(poll_id, display_order);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_question_options_order ON question_options(question_id, display_order);
CREATE INDEX IF NOT EXISTS idx_survey_responses_poll ON survey_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_question ON survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_poll_question ON survey_responses(poll_id, question_id);

-- Comments
COMMENT ON TABLE survey_questions IS 'Multi-question survey support with different question types';
COMMENT ON COLUMN survey_questions.question_type IS 'single_choice, multiple_choice, text, rating_scale, ranked_choice';
COMMENT ON COLUMN survey_questions.config IS 'Type-specific config: rating_scale={min,max,minLabel,maxLabel}, text={maxLength,placeholder}';
COMMENT ON TABLE survey_responses IS 'Anonymous survey responses - same privacy model as votes';
COMMENT ON TABLE survey_nullifiers IS 'Prevents double survey submission per user per poll';
