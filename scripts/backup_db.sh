#!/usr/bin/env bash
# Nightly backup of the production database (read-only: pg_dump never
# changes the database). Keeps the newest $KEEP_DAYS dumps.
#
# Installed on the Oracle host as ~/bin/backup_db.sh, run by cron:
#   30 3 * * * $HOME/bin/backup_db.sh >> $HOME/backups/postgres/backup.log 2>&1
#
# Restore a dump into a scratch database to check it, e.g.:
#   sudo -u postgres createdb restore_test
#   sudo -u postgres pg_restore -d restore_test ~/backups/postgres/myapp-YYYY-MM-DD.dump
set -euo pipefail
umask 077   # dumps contain password hashes and sessions: owner-only

DB="${DB:-myapp}"
DIR="${BACKUP_DIR:-$HOME/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$DIR"
out="$DIR/$DB-$(date +%F).dump"
tmp="$out.partial"

# Custom format (-Fc): compressed, and pg_restore can pick single tables.
sudo -n -u postgres pg_dump -Fc "$DB" > "$tmp"
mv "$tmp" "$out"
find "$DIR" -name "$DB-*.dump" -mtime +"$((KEEP_DAYS - 1))" -delete

echo "$(date -Is) backed up $DB -> $out ($(du -h "$out" | cut -f1))"
