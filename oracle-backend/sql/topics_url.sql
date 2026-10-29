-- Adds a link back to the original post for topics collected by
-- `manage.py collect_topics`. Additive and nullable, so it is safe to run
-- BEFORE deploying the code that uses it (older code just ignores it).
-- Idempotent: safe to re-run.
--
--   psql -d myapp -c "SET search_path TO myapp_v1" -f sql/topics_url.sql

ALTER TABLE topics ADD COLUMN IF NOT EXISTS url varchar;

-- Speeds up the collector's "already saved today?" check.
CREATE INDEX IF NOT EXISTS topics_source_date_idx ON topics (source, created_date);
