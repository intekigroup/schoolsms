export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { readdirSync, statSync } from 'node:fs'
import { prisma } from '@/lib/db'

/**
 * Liveness for an external uptime checker and the server's own cron.
 * Reports the database, the last migration, the age of the newest backup
 * export, and recent unhandled errors — never any school data.
 *   200 { ok: true }  · 503 { ok: false, problems: [...] }
 */
const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups'
const BACKUP_MAX_AGE_H = Number(process.env.BACKUP_MAX_AGE_HOURS || 30)

export async function GET() {
  const problems: string[] = []
  let db = 'ok', migration: string | null = null, errors24h = 0
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>('select migration_name from _prisma_migrations where finished_at is not null order by finished_at desc limit 1')
    migration = rows[0]?.migration_name ?? null
    errors24h = await prisma.errorLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } })
  } catch (e: any) { db = 'down'; problems.push(`database: ${e?.message?.split('\n')[0] ?? 'unreachable'}`) }

  let backupAgeHours: number | null = null
  try {
    const newest = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.gz')).map((f) => statSync(`${BACKUP_DIR}/${f}`).mtimeMs).sort((a, b) => b - a)[0]
    if (newest) backupAgeHours = Math.round((Date.now() - newest) / 36e5)
  } catch { /* no backup directory mounted (dev) */ }
  if (backupAgeHours === null) { if (process.env.NODE_ENV === 'production') problems.push('backup: no export found') }
  else if (backupAgeHours > BACKUP_MAX_AGE_H) problems.push(`backup: newest export is ${backupAgeHours} h old`)

  const body = { ok: problems.length === 0, at: new Date().toISOString(), db, migration, backupAgeHours, errors24h, commit: process.env.GIT_COMMIT || null, problems }
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
