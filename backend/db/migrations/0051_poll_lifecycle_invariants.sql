BEGIN;

ALTER TABLE public.polls
    DROP CONSTRAINT IF EXISTS polls_time_window_check;

ALTER TABLE public.polls
    ADD CONSTRAINT polls_time_window_check
    CHECK (start_at IS NULL OR end_at IS NULL OR start_at < end_at);

ALTER TABLE public.polls
    DROP CONSTRAINT IF EXISTS polls_title_not_blank_check;

ALTER TABLE public.polls
    ADD CONSTRAINT polls_title_not_blank_check
    CHECK (length(btrim(title)) > 0);

CREATE OR REPLACE FUNCTION public.enforce_published_poll_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'only draft polls may be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.published_at IS NOT NULL AND (
        NEW.title IS DISTINCT FROM OLD.title OR
        NEW.description IS DISTINCT FROM OLD.description OR
        NEW.type IS DISTINCT FROM OLD.type OR
        NEW.start_at IS DISTINCT FROM OLD.start_at OR
        NEW.end_at IS DISTINCT FROM OLD.end_at OR
        NEW.audience_rules IS DISTINCT FROM OLD.audience_rules OR
        NEW.min_k_anonymity IS DISTINCT FROM OLD.min_k_anonymity OR
        NEW.rewards_enabled IS DISTINCT FROM OLD.rewards_enabled OR
        NEW.reward_amount IS DISTINCT FROM OLD.reward_amount OR
        NEW.reward_token IS DISTINCT FROM OLD.reward_token OR
        NEW.published_at IS DISTINCT FROM OLD.published_at
    ) THEN
        RAISE EXCEPTION 'published poll content is immutable';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS polls_lifecycle_guard ON public.polls;
CREATE TRIGGER polls_lifecycle_guard
    BEFORE UPDATE OR DELETE ON public.polls
    FOR EACH ROW EXECUTE FUNCTION public.enforce_published_poll_immutability();

CREATE OR REPLACE FUNCTION public.enforce_published_poll_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_poll_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'question_options' THEN
        SELECT poll_id INTO target_poll_id
          FROM public.survey_questions
         WHERE id = COALESCE(NEW.question_id, OLD.question_id);
    ELSE
        target_poll_id := COALESCE(NEW.poll_id, OLD.poll_id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.polls
         WHERE id = target_poll_id AND published_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'published poll content is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poll_options_lifecycle_guard ON public.poll_options;
CREATE TRIGGER poll_options_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.poll_options
    FOR EACH ROW EXECUTE FUNCTION public.enforce_published_poll_child_immutability();

DROP TRIGGER IF EXISTS survey_questions_lifecycle_guard ON public.survey_questions;
CREATE TRIGGER survey_questions_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.survey_questions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_published_poll_child_immutability();

DROP TRIGGER IF EXISTS question_options_lifecycle_guard ON public.question_options;
CREATE TRIGGER question_options_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
    FOR EACH ROW EXECUTE FUNCTION public.enforce_published_poll_child_immutability();

COMMIT;
