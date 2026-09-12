#!/usr/bin/env bash
# Pull-based continuous deployment, run from cron every 2 minutes on the server:
#   */2 * * * * /home/inteki/shule/deploy/autodeploy.sh >> /home/inteki/shule/backups/autodeploy.log 2>&1
# Deploys a new origin/main commit only after GitHub's "check" job for that exact commit
# has passed, so a red type-check never reaches production. Needs no secrets anywhere:
# the repository is read with the server's deploy key and the check status is public.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="${GITHUB_REPO:-intekigroup/schoolsms}"
exec 9>backups/.autodeploy.lock; flock -n 9 || exit 0          # one at a time; a build takes ~8 min
git fetch --quiet origin main || { echo "[$(date -u +%FT%TZ)] fetch failed"; exit 1; }
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0
SHORT=${REMOTE:0:7}
# GitHub's check-runs for the commit (public API, no token). Wait until the "check" job is green.
status=$(curl -s -m 20 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/commits/$REMOTE/check-runs" \
  | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); runs=[r for r in d.get("check_runs",[]) if r.get("name")=="check"]
  print("none" if not runs else (runs[0].get("conclusion") or runs[0].get("status") or "pending"))
except Exception: print("unknown")' 2>/dev/null)
case "$status" in
  success) ;;
  none|unknown) echo "[$(date -u +%FT%TZ)] $SHORT: no check result yet ($status), waiting";;
  *) echo "[$(date -u +%FT%TZ)] $SHORT: check is '$status', not deploying"; exit 0;;
esac
[ "$status" = success ] || exit 0
echo "[$(date -u +%FT%TZ)] $SHORT passed checks — deploying"
exec 9>&-   # hand the lock to deploy.sh, which takes it itself (holding it here would deadlock)
./deploy/deploy.sh main
