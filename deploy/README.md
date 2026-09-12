# Shule SMS — production on the INTEKI server

**URL:** https://school.intekigroup.co.tz
**Server:** 169.58.3.24 (SSH port 2024, user `inteki`), Ubuntu, Docker Compose.
**Location:** `/home/inteki/shule` (compose project `shule`).

## How it is wired
- `shule-app-1` — this app (image `shule-sms`, built from `deploy/Dockerfile`), `next start` on :3000, no
  published ports. On start it runs `prisma migrate deploy` then serves.
- `shule-shule-db-1` — PostgreSQL 16, volume `shule_pgdata`. Named `shule-db` (not `db`) because the app
  also sits on Caddy's network where the OMS project already has a `db`.
- TLS and routing: the existing Caddy container (`inteki-oms-caddy-1`) proxies
  `school.intekigroup.co.tz → shule-web:3000` (site block appended to `~/inteki-oms/deploy/Caddyfile`;
  the app joins network `inteki-oms_default` with alias `shule-web`). Certificates are automatic
  (`*.intekigroup.co.tz` already points at this server).
- Secrets live in `/home/inteki/shule/.env` (mode 600): `DATABASE_URL`, `POSTGRES_PASSWORD`,
  `AUTH_SECRET`, `APP_URL`, `APP_EDITION=saas`, `SCHOOL_TIMEZONE`, `CONTACT_PHONE`, `MAIL_TRANSPORT=console`,
  `SMS_PROVIDER=console`, `BILLING_CRON_SECRET`.

## Everyday commands (on the server, in `~/shule`)
```sh
docker compose ps                         # status
docker compose logs -f app                # app log
docker compose restart app                # restart
docker compose exec app npx prisma migrate status
docker compose exec app node scripts/backup-school.mjs school-kilimanjaro backups
```

## Deploying a new version (from the dev machine)
The server deploys **from the Git repository** (`github.com/intekigroup/schoolsms`), never from a laptop:

```sh
git push origin main                                   # from your machine
ssh -i ~/.ssh/id_ed25519_shule -p 2024 inteki@169.58.3.24 '~/shule/deploy/deploy.sh'
```

`deploy/deploy.sh` fetches `origin/main`, resets the checkout to it (`.env` and `backups/` are untracked and
untouched), rebuilds the image, waits for the health check and confirms `/login` answers 200. Migrations apply
automatically on start. Roll back with `~/shule/deploy/deploy.sh <branch-or-tag>` or by reverting the commit.
`.github/workflows/deploy.yml` runs the type-check on every push. Deployment is **pull-based**: `deploy/autodeploy.sh`
runs from cron every 2 minutes, fetches `origin/main`, and when the commit differs from the checkout and GitHub's
`check` job for that commit is green, runs `deploy.sh`. No SSH key in GitHub, nothing to configure. Log:
`backups/autodeploy.log`. To pause automatic deploys, comment the cron line.

## Backups
`deploy/backup.sh` (in the project, so `rsync --delete` keeps it — the old copy outside the tree was deleted by a
redeploy on 2026-09-11 and the nightly job failed silently until 2026-09-12) runs nightly at 02:20 UTC from the user
crontab: full `pg_dump` (`backups/shule-<stamp>.sql.gz`) plus a per-school JSON export of every school; files older
than 30 days are pruned. Log: `backups/backup.log` — check it, the script exits non-zero on failure.
**Still to do:** copy dumps off-server and alert on a skipped night; today every dump is on the same disk as Postgres.
Restore a full dump: `gunzip -c backups/shule-<stamp>.sql.gz | docker compose exec -T shule-db psql -U shule -d shule`.

## Still to configure
- **Email**: configured — `MAIL_TRANSPORT=smtp` via the INTEKI mail server (`mail.intekigroup.co.tz:465`,
  implicit TLS) as `no-reply@intekigroup.co.tz` (mailbox created with `docker exec mailserver setup email add`;
  password only in `.env`). Rotate it with `setup email update no-reply@intekigroup.co.tz <new>` and `.env`.
- **Mail deliverability (DNS at Contabo)** — MX and A exist, but the domain has **no SPF, DKIM or DMARC**
  and the PTR is `vmi3434651.contaboserver.net`, so Gmail/Outlook may junk or reject mail. Add:
  - `intekigroup.co.tz` TXT: `v=spf1 mx a:mail.intekigroup.co.tz ip4:169.58.3.24 -all`
  - `mail._domainkey.intekigroup.co.tz` TXT: the value in
    `docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/intekigroup.co.tz/mail.txt`
    (`v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…`)
  - `_dmarc.intekigroup.co.tz` TXT: `v=DMARC1; p=quarantine; rua=mailto:postmaster@intekigroup.co.tz`
  - Reverse DNS (Contabo panel → server → PTR): `169.58.3.24 → mail.intekigroup.co.tz`
- **SMS**: `SMS_PROVIDER=nextsms` + NextSMS credentials (IntekiSMS provider still to be written).
- **Demo data**: the seed created Kilimanjaro Academy with `admin@kilimanjaro.tz / admin123`,
  `super@shulesms.tz / super123`, `parent@kilimanjaro.tz / parent123` — change these before real use, or
  remove the demo school from the super-admin console.
