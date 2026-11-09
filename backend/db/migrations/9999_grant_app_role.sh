#!/bin/sh
set -eu

: "${DB_APP_USER:?DB_APP_USER is required}"

psql -X -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$DB_APP_USER" \
  --set=db_name="$POSTGRES_DB" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO :"app_user";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO :"app_user";

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM :"app_user";
GRANT SELECT, INSERT ON public.audit_log TO :"app_user";
REVOKE DELETE, TRUNCATE ON public.audit_checkpoints FROM :"app_user";
GRANT SELECT, INSERT, UPDATE ON public.audit_checkpoints TO :"app_user";
SQL
