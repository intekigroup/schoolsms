#!/usr/bin/env bash
# Deploy Shule SMS on the server from the Git repository (no more rsync from a laptop).
#   ~/shule/deploy/deploy.sh [branch]      default: main
# Pulls the branch, rebuilds the image, restarts the app (migrations run on start),
# then proves the site answers. Untracked files (.env, backups/) are left alone.
set -euo pipefail
BRANCH="${1:-main}"
cd "$(dirname "$0")/.."
echo "[$(date -u +%FT%TZ)] deploy $BRANCH start"
git fetch --quiet origin "$BRANCH"
BEFORE=$(git rev-parse --short HEAD 2>/dev/null || echo none)
git reset --quiet --hard "origin/$BRANCH"
AFTER=$(git rev-parse --short HEAD)
echo "  $BEFORE -> $AFTER: $(git log -1 --format=%s)"
docker compose up -d --build 2>&1 | grep -E "Built|Recreated|Started|error" || true
# Wait for the container's health check, then for the app to answer through the proxy.
for i in $(seq 1 60); do
  s=$(docker inspect -f '{{.State.Health.Status}}' shule-app-1 2>/dev/null || echo starting)
  [ "$s" = healthy ] && break; sleep 5
done
code=$(curl -s -o /dev/null -w '%{http_code}' https://school.intekigroup.co.tz/login || echo 000)
docker compose logs app --tail 30 2>&1 | grep -iE "migration|applied|ready|error" | tail -4
if [ "$code" = 200 ]; then echo "[$(date -u +%FT%TZ)] deploy ok ($AFTER, /login $code)"; else echo "[$(date -u +%FT%TZ)] deploy FAILED: /login returned $code"; exit 1; fi
