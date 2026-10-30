-- The mortgage calculator was removed; this drops its table, plus the
-- unused, hand-made mortgate_* tables (mortgate_info first: it has an FK
-- to mortgate_group).
-- Run it only AFTER the code without the calculator is deployed (older code
-- still queries the table). Back the rows up first if you want to keep them:
--
--   sudo -u postgres pg_dump -d myapp -t 'myapp_v1.mortgage' -t 'myapp_v1.mortgate_*' > mortgage_backup.sql
--   sudo -u postgres psql -d myapp -c "SET ROLE wuz" -c "SET search_path TO myapp_v1" -f sql/drop_mortgage.sql

DROP TABLE IF EXISTS mortgage;
DROP TABLE IF EXISTS mortgate_info;
DROP TABLE IF EXISTS mortgate_group;
