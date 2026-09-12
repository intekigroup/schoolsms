#!/usr/bin/env bash
# Every 5 minutes from cron: is the live site answering and healthy? Emails once when it breaks
# and once when it recovers (state file), so a night-long outage is one message, not sixty.
#   */5 * * * * /home/inteki/shule/deploy/healthcheck.sh >> /home/inteki/shule/backups/health.log 2>&1
set -uo pipefail
cd "$(dirname "$0")/.."
URL="${HEALTH_URL:-https://school.intekigroup.co.tz/api/health}"
STATE=backups/.health-state
body=$(curl -sS -m 20 "$URL" 2>&1); code=$?
ok=0; if [ $code -eq 0 ] && echo "$body" | grep -q '"ok":true'; then ok=1; fi
prev=$(cat "$STATE" 2>/dev/null || echo 1)
echo "$ok" > "$STATE"
if [ "$ok" = 0 ] && [ "$prev" = 1 ]; then
  printf 'Health check FAILED at %s\n\n%s\n%s\n' "$(date -u +%FT%TZ)" "$URL" "$body" | ./deploy/mail.sh "[Shule SMS] site unhealthy"; echo "[$(date -u +%FT%TZ)] DOWN: $body"
elif [ "$ok" = 1 ] && [ "$prev" = 0 ]; then
  printf 'Recovered at %s\n\n%s\n' "$(date -u +%FT%TZ)" "$body" | ./deploy/mail.sh "[Shule SMS] site recovered"; echo "[$(date -u +%FT%TZ)] UP"
fi
