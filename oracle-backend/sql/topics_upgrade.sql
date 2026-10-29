-- Topics upgrade for the hot-topic collector and the Claude Code "Ask AI"
-- queue. Additive, nullable columns only, so it is safe to run BEFORE
-- deploying the code that uses them (older code just ignores them).
-- Idempotent: safe to re-run.
--
--   sudo -u postgres psql -d myapp -c "SET ROLE wuz" -c "SET search_path TO myapp_v1" -f sql/topics_upgrade.sql

-- Link back to the original post (filled by `manage.py collect_topics`).
ALTER TABLE topics ADD COLUMN IF NOT EXISTS url varchar;

-- "Ask AI" queue, processed on the host by scripts/ai_worker.py:
--   ai_status: NULL (never asked) | pending | running | done | error
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_status varchar;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_question varchar;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_requested_at timestamptz;

-- Speeds up the collector's "already saved recently?" check and the
-- page's per-date listing.
CREATE INDEX IF NOT EXISTS topics_source_date_idx ON topics (source, created_date);
CREATE INDEX IF NOT EXISTS topics_date_idx ON topics (created_date);
-- The worker only ever looks for queued rows.
CREATE INDEX IF NOT EXISTS topics_ai_queue_idx ON topics (ai_requested_at) WHERE ai_status = 'pending';
