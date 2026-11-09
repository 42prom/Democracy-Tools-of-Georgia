BEGIN;

CREATE INDEX IF NOT EXISTS idx_audit_log_admin_events
    ON public.audit_log(id DESC)
    WHERE event_type LIKE 'ADMIN_%';

COMMIT;
