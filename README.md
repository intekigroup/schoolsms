# Shule SMS

Multi-tenant school management for Tanzanian private schools: registration and onboarding,
pupils and classes, attendance, exams and report cards, fees with receipts, invoices and sibling
discounts, HR and payroll (PAYE, NSSF, SDL, WCF), accounting, library, hostel, transport, timetable
and seating, messaging (in-app, SMS, email), parent and pupil portals, per-school roles, English and
Kiswahili.

Live: https://school.intekigroup.co.tz

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 on PostgreSQL 16 · NextAuth v5 ·
Tailwind + shadcn/ui · pdf-lib for documents · Docker Compose behind Caddy.

## Run locally

```sh
cp .env.example .env            # set DATABASE_URL, AUTH_SECRET, SMTP_* as needed
npm install
npx prisma migrate deploy && npx prisma generate
npx tsx scripts/seed.ts         # demo school with logins (see scripts/seed.ts)
npm run dev                     # http://localhost:3000
```

## Tests

Each feature has an executable suite under `scripts/*-test.mjs` that runs against the dev server
and cleans up after itself, for example:

```sh
node scripts/roles-permissions-test.mjs
node scripts/parent-portal-test.mjs
node scripts/siblings-test.mjs
```

## Deploy

Deploys come from this repository, never from a laptop. Pushing to `main` runs the type-check and,
with the `DEPLOY_*` secrets set, deploys over SSH by running `deploy/deploy.sh` on the server.
See `deploy/README.md` for the runbook, backups and DNS notes.
