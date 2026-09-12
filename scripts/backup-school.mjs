// Per-tenant backup: one school's data only.
//
//   node scripts/backup-school.mjs <schoolId|name fragment> [outDir]
//
// scripts/backup.mjs dumps the whole platform, which cannot restore one
// customer without overwriting every other. This exports a single school so it
// can be recovered, migrated, or handed over on request, without touching
// anyone else's records.
//
// Restore with scripts/restore-school.mjs.

import { createRequire } from 'node:module'
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const prisma = new PrismaClient()

const arg = process.argv[2]
const outDir = process.argv[3] ?? 'backups'
if (!arg) {
  console.error('usage: node scripts/backup-school.mjs <schoolId|name fragment> [outDir]')
  process.exit(1)
}

/**
 * How each table is reached from a school. Guardians and the join tables carry
 * no schoolId, so they are found through their pupils — the same rule the API
 * uses for tenancy.
 */
export function tenantQueries(schoolId, prisma) {
  const bySchool = { where: { schoolId } }
  return [
    ['School', () => prisma.school.findMany({ where: { id: schoolId } })],
    ['SchoolSubscription', () => prisma.schoolSubscription.findMany(bySchool)],
    ['User', () => prisma.user.findMany(bySchool)],
    ['AcademicYear', () => prisma.academicYear.findMany(bySchool)],
    ['Term', () => prisma.term.findMany({ where: { academicYear: { schoolId } } })],
    ['Staff', () => prisma.staff.findMany(bySchool)],
    ['Class', () => prisma.class.findMany(bySchool)],
    ['Subject', () => prisma.subject.findMany(bySchool)],
    ['ClassSubject', () => prisma.classSubject.findMany({ where: { class: { schoolId } } })],
    ['StaffSubject', () => prisma.staffSubject.findMany({ where: { staff: { schoolId } } })],
    ['Student', () => prisma.student.findMany(bySchool)],
    ['Guardian', () => prisma.guardian.findMany({ where: { students: { some: { student: { schoolId } } } } })],
    ['StudentGuardian', () => prisma.studentGuardian.findMany({ where: { student: { schoolId } } })],
    ['TimetableSlot', () => prisma.timetableSlot.findMany({ where: { class: { schoolId } } })],
    ['SeatPlan', () => prisma.seatPlan.findMany({ where: { class: { schoolId } } })],
    ['Assignment', () => prisma.assignment.findMany(bySchool)],
    ['Message', () => prisma.message.findMany(bySchool)],
    ['Attendance', () => prisma.attendance.findMany({ where: { student: { schoolId } } })],
    ['StaffAttendance', () => prisma.staffAttendance.findMany({ where: { staff: { schoolId } } })],
    ['LeaveRequest', () => prisma.leaveRequest.findMany({ where: { staff: { schoolId } } })],
    ['Exam', () => prisma.exam.findMany({ where: { class: { schoolId } } })],
    ['ExamResult', () => prisma.examResult.findMany({ where: { student: { schoolId } } })],
    ['FeeStructure', () => prisma.feeStructure.findMany(bySchool)],
    ['FeePayment', () => prisma.feePayment.findMany({ where: { student: { schoolId } } })],
    ['Book', () => prisma.book.findMany(bySchool)],
    ['BookIssue', () => prisma.bookIssue.findMany({ where: { book: { schoolId } } })],
    ['Dormitory', () => prisma.dormitory.findMany(bySchool)],
    ['Room', () => prisma.room.findMany({ where: { dormitory: { schoolId } } })],
    ['RoomAssignment', () => prisma.roomAssignment.findMany({ where: { student: { schoolId } } })],
    ['TransportRoute', () => prisma.transportRoute.findMany(bySchool)],
    ['Vehicle', () => prisma.vehicle.findMany(bySchool)],
    ['VehicleRoute', () => prisma.vehicleRoute.findMany({ where: { route: { schoolId } } })],
    ['StudentRoute', () => prisma.studentRoute.findMany({ where: { student: { schoolId } } })],
    ['Event', () => prisma.event.findMany(bySchool)],
    ['Announcement', () => prisma.announcement.findMany(bySchool)],
    ['Notification', () => prisma.notification.findMany({ where: { user: { schoolId } } })],
    ['SmsLog', () => prisma.smsLog.findMany(bySchool)],
    ['AuditLog', () => prisma.auditLog.findMany(bySchool)],
    ['Invoice', () => prisma.invoice.findMany(bySchool)],
    ['InvoicePayment', () => prisma.invoicePayment.findMany({ where: { invoice: { schoolId } } })],
    ['ReportSettings', () => prisma.reportSettings.findMany(bySchool)],
    ['ReportRemark', () => prisma.reportRemark.findMany({ where: { student: { schoolId } } })],
    ['IdCardSettings', () => prisma.idCardSettings.findMany(bySchool)],
    ['HrSettings', () => prisma.hrSettings.findMany(bySchool)],
    ['StaffPayItem', () => prisma.staffPayItem.findMany({ where: { staff: { schoolId } } })],
    ['PayrollRun', () => prisma.payrollRun.findMany(bySchool)],
    ['Payslip', () => prisma.payslip.findMany({ where: { run: { schoolId } } })],
    ['AccountingSettings', () => prisma.accountingSettings.findMany(bySchool)],
    ['LedgerAccount', () => prisma.ledgerAccount.findMany(bySchool)],
    ['JournalEntry', () => prisma.journalEntry.findMany(bySchool)],
    ['JournalLine', () => prisma.journalLine.findMany({ where: { entry: { schoolId } } })],
    ['Expense', () => prisma.expense.findMany(bySchool)],
    ['Budget', () => prisma.budget.findMany(bySchool)],
  ]
}

async function main() {
  const school =
    (await prisma.school.findUnique({ where: { id: arg } })) ??
    (await prisma.school.findFirst({ where: { name: { contains: arg, mode: 'insensitive' } } }))

  if (!school) {
    console.error(`No school matched "${arg}".`)
    const all = await prisma.school.findMany({ select: { id: true, name: true } })
    console.error('Available:')
    for (const s of all) console.error(`  ${s.id}  ${s.name}`)
    process.exit(1)
  }

  console.log(`backing up ${school.name} (${school.id})\n`)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const data = {}
  let total = 0
  for (const [table, query] of tenantQueries(school.id, prisma)) {
    try {
      const rows = await query()
      data[table] = rows
      total += rows.length
      if (rows.length) console.log(`  ${table.padEnd(20)} ${rows.length}`)
    } catch (e) {
      if (!/does not exist/i.test(String(e?.message))) throw e
      console.log(`  ${table.padEnd(20)} (absent, skipped)`)
    }
  }

  const applied = await prisma
    .$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`)
    .catch(() => [])

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const slug = school.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const file = path.join(outDir, `school-${slug}-${stamp}.json.gz`)

  const payload = {
    format: 1,
    scope: 'school',
    schoolId: school.id,
    schoolName: school.name,
    takenAt: new Date().toISOString(),
    migration: applied[0]?.migration_name ?? null,
    tables: data,
  }

  const json = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  await pipeline(Readable.from([json]), createGzip({ level: 9 }), createWriteStream(file))

  console.log(`\n${total} rows for ${school.name}`)
  console.log(`written to ${file}`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('backup failed:', e)
  await prisma.$disconnect()
  process.exit(1)
})
