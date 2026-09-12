#!/usr/bin/env bash
# Send a plain-text email from the server using the app's SMTP settings in .env (curl, no extra packages).
#   deploy/mail.sh "<subject>" < body.txt
set -euo pipefail
cd "$(dirname "$0")/.."
env_get() { { grep -E "^$1=" .env || true; } | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
HOST=$(env_get SMTP_HOST); PORT=$(env_get SMTP_PORT); USER_=$(env_get SMTP_USER); PASS=$(env_get SMTP_PASS)
FROM=$(env_get MAIL_FROM | sed -e 's/.*<//' -e 's/>.*//'); TO=$(env_get ALERT_EMAIL); [ -n "$TO" ] || TO=$(env_get CONTACT_EMAIL)
[ -n "$HOST" ] && [ -n "$TO" ] || { echo "mail.sh: SMTP_HOST or CONTACT_EMAIL missing in .env" >&2; exit 1; }
SUBJECT="${1:-Shule SMS server}"
{ printf 'From: Shule SMS server <%s>\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\n\r\n' "$FROM" "$TO" "$SUBJECT" "$(date -R)"; cat; } | \
  curl -sS --url "smtps://$HOST:${PORT:-465}" --mail-from "$FROM" --mail-rcpt "$TO" --user "$USER_:$PASS" -T - >/dev/null
