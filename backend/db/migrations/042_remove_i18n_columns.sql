-- Fix column names: rename i18n columns back to original names
-- The database has title_en/title_ka and text_en/text_ka but code expects title and text

-- Rename title_en to title in polls table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'polls' AND column_name = 'title_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'polls' AND column_name = 'title'
    ) THEN
        ALTER TABLE polls RENAME COLUMN title_en TO title;
        RAISE NOTICE 'Renamed polls.title_en to polls.title';
    END IF;
END $$;

-- Drop title_ka column from polls if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'polls' AND column_name = 'title_ka'
    ) THEN
        ALTER TABLE polls DROP COLUMN title_ka;
        RAISE NOTICE 'Dropped polls.title_ka column';
    END IF;
END $$;

-- Rename description_en to description in polls table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'polls' AND column_name = 'description_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'polls' AND column_name = 'description'
    ) THEN
        ALTER TABLE polls RENAME COLUMN description_en TO description;
        RAISE NOTICE 'Renamed polls.description_en to polls.description';
    END IF;
END $$;

-- Drop description_ka column from polls if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'polls' AND column_name = 'description_ka'
    ) THEN
        ALTER TABLE polls DROP COLUMN description_ka;
        RAISE NOTICE 'Dropped polls.description_ka column';
    END IF;
END $$;

-- Rename text_en to text in poll_options table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'poll_options' AND column_name = 'text_en'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'poll_options' AND column_name = 'text'
    ) THEN
        ALTER TABLE poll_options RENAME COLUMN text_en TO text;
        RAISE NOTICE 'Renamed poll_options.text_en to poll_options.text';
    END IF;
END $$;

-- Drop text_ka column from poll_options if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'poll_options' AND column_name = 'text_ka'
    ) THEN
        ALTER TABLE poll_options DROP COLUMN text_ka;
        RAISE NOTICE 'Dropped poll_options.text_ka column';
    END IF;
END $$;
