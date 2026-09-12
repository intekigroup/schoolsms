// Logical backup of every application table.
//
//   node scripts/backup.mjs [outDir]     -> backups/shule-<timestamp>.json.gz
//
// Why not pg_dump: the bundled PostgreSQL distribution ships only initdb,
// pg_ctl and postgres. If you install full client tooling later, pg_dump is
// strictly better — it captures sequences, roles and extensions too. This
// captures the application's own data, which is what a school would lose.
//
// Restore with scripts/restore.mjs.

import { createRequire } from 'node:module'
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const prisma = new PrismaClient()

// Parents before children, so a restore can insert in this order directly.
export const TABLE_ORDER = [
  'School', 'SchoolSubscription', 'User', 'Account', 'Session', 'VerificationToken',
  'AcademicYear', 'Term', 'Staff', 'Class', 'Subject', 'ClassSubject', 'StaffSubject',
  'Student', 'Guardian', 'StudentGuardian',
  'TimetableSlot', 'Attendance', 'StaffAttendance', 'LeaveRequest',
  'Exam', 'ExamResult', 'FeeStructure', 'FeePayment',
  'Book', 'BookIssue', 'Dormitory', 'Room', 'RoomAssignment',
  'TransportRoute', 'Vehicle', 'VehicleRoute', 'StudentRoute',
  'Event', 'Announcement', 'Notification', 'SmsLog', 'AuditLog',
]

const BATCH = 1000

async function dumpTable(name) {
  const rows = []
  let offset = 0
  for (;;) {
    const page = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${name}" ORDER BY 1 LIMIT ${BATCH} OFFSET ${offset}`
    )
    rows.push(...page)
    if (page.length < BATCH) break
    offset += BATCH
  }
  return rows
}

async function main() {
  const outDir = process.argv[2] ?? 'backups'
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const applied = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`
  ).catch(() => [])

  const data = {}
  let total = 0
  for (const table of TABLE_ORDER) {
    try {
      const rows = await dumpTable(table)
      data[table] = rows
      total += rows.length
      if (rows.length) console.log(`  ${table.padEnd(20)} ${rows.length}`)
    } catch (e) {
      // A table in the list that this schema version doesn't have is not fatal.
      if (!/does not exist/i.test(String(e?.message))) throw e
      console.log(`  ${table.padEnd(20)} (absent, skipped)`)
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(outDir, `shule-${stamp}.json.gz`)
  const payload = {
    format: 1,
    takenAt: new Date().toISOString(),
    migration: applied[0]?.migration_name ?? null,
    tables: data,
  }

  // BigInt/Date survive the round trip as ISO strings; Prisma parses them back.
  const json = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  await pipeline(Readable.from([json]), createGzip({ level: 9 }), createWriteStream(file))

  console.log(`\n${total} rows from ${Object.keys(data).length} tables`)
  console.log(`written to ${file}`)
  if (payload.migration) console.log(`schema at migration ${payload.migration}`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('backup failed:', e)
  await prisma.$disconnect()
  process.exit(1)
})
