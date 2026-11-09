-- Gives each survey submission a stable, random, non-answer-bearing receipt ID.
-- The authoritative duplicate protection remains (poll_id, nullifier_hash).

ALTER TABLE public.survey_nullifiers
    ADD COLUMN IF NOT EXISTS submission_id uuid DEFAULT gen_random_uuid();

UPDATE public.survey_nullifiers
SET submission_id = gen_random_uuid()
WHERE submission_id IS NULL;

ALTER TABLE public.survey_nullifiers
    ALTER COLUMN submission_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN submission_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS survey_nullifiers_submission_id_key
    ON public.survey_nullifiers(submission_id);

