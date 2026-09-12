#!/usr/bin/env bash
# Nightly backup for the Shule SMS stack. Lives in the project (deploy/backup.sh) so a
# redeploy with `rsync --delete` can never remove it again. Cron: 20 2 * * * (UTC).
#   - full pg_dump of the Postgres service  -> backups/shule-<stamp>.sql.gz
#   - per-school JSON export of every school  -> backups/<school>-<stamp>.json.gz (inside the app volume)
#   - prunes files older than 30 days; exits non-zero on any failure so the log shows it
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP=$(date -u +%Y%m%d-%H%M)
echo "[$(date -u +%FT%TZ)] backup start"
docker compose exec -T shule-db pg_dump -U shule shule | gzip -9 > "backups/shule-$STAMP.sql.gz"
test -s "backups/shule-$STAMP.sql.gz"
# Every school, by id, so a new tenant is covered the night it signs up.
for id in $(docker compose exec -T shule-db psql -U shule -d shule -tAc 'select id from "School"'); do
  docker compose exec -T app node scripts/backup-school.mjs "$id" /app/backups >/dev/null && echo "  school $id exported"
done
find backups -name '*.gz' -mtime +30 -delete
docker compose exec -T app sh -c 'find /app/backups -name "*.gz" -mtime +30 -delete' || true
echo "[$(date -u +%FT%TZ)] backup ok: backups/shule-$STAMP.sql.gz ($(du -h "backups/shule-$STAMP.sql.gz" | cut -f1))"
