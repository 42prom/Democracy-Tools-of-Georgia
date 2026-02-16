-- Fix remaining i18n columns in survey_questions, question_options, and messages tables
-- Note: regions table intentionally keeps name_en and name_ka

-- ============================================
-- SURVEY_QUESTIONS TABLE
-- ============================================

-- Rename question_text_en to question_text
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_questions' AND column_name = 'question_text_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_questions' AND column_name = 'question_text'
    ) THEN
        ALTER TABLE survey_questions RENAME COLUMN question_text_en TO question_text;
        RAISE NOTICE 'Renamed survey_questions.question_text_en to survey_questions.question_text';
    END IF;
END $$;

-- Drop question_text_ka column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_questions' AND column_name = 'question_text_ka'
    ) THEN
        ALTER TABLE survey_questions DROP COLUMN question_text_ka;
        RAISE NOTICE 'Dropped survey_questions.question_text_ka column';
    END IF;
END $$;

-- ============================================
-- QUESTION_OPTIONS TABLE
-- ============================================

-- Rename option_text_en to option_text
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'question_options' AND column_name = 'option_text_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'question_options' AND column_name = 'option_text'
    ) THEN
        ALTER TABLE question_options RENAME COLUMN option_text_en TO option_text;
        RAISE NOTICE 'Renamed question_options.option_text_en to question_options.option_text';
    END IF;
END $$;

-- Drop option_text_ka column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'question_options' AND column_name = 'option_text_ka'
    ) THEN
        ALTER TABLE question_options DROP COLUMN option_text_ka;
        RAISE NOTICE 'Dropped question_options.option_text_ka column';
    END IF;
END $$;

-- ============================================
-- MESSAGES TABLE
-- ============================================

-- Rename title_en to title
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'title_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'title'
    ) THEN
        ALTER TABLE messages RENAME COLUMN title_en TO title;
        RAISE NOTICE 'Renamed messages.title_en to messages.title';
    END IF;
END $$;

-- Drop title_ka column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'title_ka'
    ) THEN
        ALTER TABLE messages DROP COLUMN title_ka;
        RAISE NOTICE 'Dropped messages.title_ka column';
    END IF;
END $$;

-- Rename body_en to body
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'body_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'body'
    ) THEN
        ALTER TABLE messages RENAME COLUMN body_en TO body;
        RAISE NOTICE 'Renamed messages.body_en to messages.body';
    END IF;
END $$;

-- Drop body_ka column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'body_ka'
    ) THEN
        ALTER TABLE messages DROP COLUMN body_ka;
        RAISE NOTICE 'Dropped messages.body_ka column';
    END IF;
END $$;
