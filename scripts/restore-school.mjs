// Restores one school from a per-tenant backup, leaving every other tenant
// untouched.
//
//   node scripts/restore-school.mjs backups/school-<name>-<stamp>.json.gz --yes
//
// Unlike scripts/restore.mjs, this never TRUNCATEs. It deletes only the rows
// belonging to the school in the backup, then reinserts them, all inside one
// transaction.

import { createRequire } from 'node:module'
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const prisma = new PrismaClient()

const file = process.argv[2]
const confirmed = process.argv.includes('--yes')
if (!file) {
  console.error('usage: node scripts/restore-school.mjs <school-backup.json.gz> --yes')
  process.exit(1)
}

async function read(path) {
  const chunks = []
  await new Promise((resolve, reject) => {
    createReadStream(path).pipe(createGunzip())
      .on('data', (c) => chunks.push(c)).on('end', resolve).on('error', reject)
  })
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const looksLikeDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)
const revive = (row) => {
  const out = {}
  for (const [k, v] of Object.entries(row)) out[k] = looksLikeDate(v) ? new Date(v) : v
  return out
}
const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`
function quoteValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (v instanceof Date) return sqlString(v.toISOString())
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  // An array of scalars is a native Postgres array (School.levels); an array of
  // objects is a JSON column (payslip lines, report config).
  if (Array.isArray(v) && v.every((el) => el === null || typeof el !== 'object')) {
    const items = v.map((el) => `"${String(el).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    return sqlString(`{${items.join(',')}}`)
  }
  if (typeof v === 'object') return sqlString(JSON.stringify(v))
  return sqlString(v)
}

/**
 * Children before parents, so deleting this school's rows never trips a foreign
 * key. Insertion walks the same list in reverse.
 */
const DELETE_ORDER = [
  'Budget', 'Expense', 'JournalLine', 'JournalEntry', 'LedgerAccount', 'AccountingSettings',
  'Payslip', 'PayrollRun', 'StaffPayItem', 'HrSettings', 'IdCardSettings', 'ReportRemark', 'ReportSettings',
  'InvoicePayment', 'Invoice', 'AuditLog', 'SmsLog', 'Notification', 'Announcement', 'Event',
  'StudentRoute', 'VehicleRoute', 'Vehicle', 'TransportRoute',
  'RoomAssignment', 'Room', 'Dormitory',
  'BookIssue', 'Book', 'FeePayment', 'FeeStructure',
  'ExamResult', 'Exam', 'LeaveRequest', 'StaffAttendance', 'Attendance',
  'Message', 'Assignment', 'SeatPlan', 'TimetableSlot', 'StudentGuardian', 'Guardian', 'Student',
  'StaffSubject', 'ClassSubject', 'Subject', 'Class', 'Staff',
  'Term', 'AcademicYear', 'User', 'SchoolSubscription', 'School',
]

async function main() {
  const backup = await read(file)
  if (backup.scope !== 'school') {
    console.error('This is not a per-school backup. Use scripts/restore.mjs for a platform-wide file.')
    process.exit(1)
  }

  const tables = Object.entries(backup.tables).filter(([, rows]) => rows.length)
  const totalRows = tables.reduce((n, [, rows]) => n + rows.length, 0)
  const live = await prisma.$queryRawUnsafe(`SELECT current_database() AS db`)

  console.log(`school:   ${backup.schoolName} (${backup.schoolId})`)
  console.log(`taken:    ${backup.takenAt}`)
  if (backup.migration) console.log(`schema:   ${backup.migration}`)
  console.log(`contents: ${totalRows} rows across ${tables.length} tables`)
  console.log(`target:   ${live[0].db}`)

  const otherSchools = await prisma.school.count({ where: { id: { not: backup.schoolId } } })
  console.log(`${otherSchools} other tenant(s) on this database will not be touched.`)

  if (!confirmed) {
    console.log('\nRefusing to proceed without --yes. Nothing was changed.')
    await prisma.$disconnect()
    return
  }

  // Ids to delete by, resolved before anything is removed.
  const sid = backup.schoolId
  const studentIds = (backup.tables.Student ?? []).map((r) => r.id)
  const staffIds = (backup.tables.Staff ?? []).map((r) => r.id)
  const classIds = (backup.tables.Class ?? []).map((r) => r.id)
  const guardianIds = (backup.tables.Guardian ?? []).map((r) => r.id)

  await prisma.$transaction(async (tx) => {
    // Existing rows for this school, found the same way the backup found them.
    const existingStudents = (await tx.student.findMany({ where: { schoolId: sid }, select: { id: true } })).map((s) => s.id)
    const existingStaff = (await tx.staff.findMany({ where: { schoolId: sid }, select: { id: true } })).map((s) => s.id)
    const existingClasses = (await tx.class.findMany({ where: { schoolId: sid }, select: { id: true } })).map((c) => c.id)
    const existingGuardians = (await tx.guardian.findMany({ where: { students: { some: { student: { schoolId: sid } } } }, select: { id: true } })).map((g) => g.id)
    const existingBooks = (await tx.book.findMany({ where: { schoolId: sid }, select: { id: true } })).map((b) => b.id)
    const existingDorms = (await tx.dormitory.findMany({ where: { schoolId: sid }, select: { id: true } })).map((d) => d.id)
    const existingRoutes = (await tx.transportRoute.findMany({ where: { schoolId: sid }, select: { id: true } })).map((r) => r.id)
    const existingYears = (await tx.academicYear.findMany({ where: { schoolId: sid }, select: { id: true } })).map((y) => y.id)
    const existingExams = (await tx.exam.findMany({ where: { class: { schoolId: sid } }, select: { id: true } })).map((e) => e.id)
    const existingUsers = (await tx.user.findMany({ where: { schoolId: sid }, select: { id: true } })).map((u) => u.id)
    const existingRooms = (await tx.room.findMany({ where: { dormitory: { schoolId: sid } }, select: { id: true } })).map((r) => r.id)

    const existingRuns = (await tx.payrollRun.findMany({ where: { schoolId: sid }, select: { id: true } })).map((r) => r.id)
    const existingEntries = (await tx.journalEntry.findMany({ where: { schoolId: sid }, select: { id: true } })).map((e) => e.id)
    const del = {
      Budget: () => tx.budget.deleteMany({ where: { schoolId: sid } }),
      Expense: () => tx.expense.deleteMany({ where: { schoolId: sid } }),
      JournalLine: () => tx.journalLine.deleteMany({ where: { entryId: { in: existingEntries } } }),
      JournalEntry: () => tx.journalEntry.deleteMany({ where: { schoolId: sid } }),
      LedgerAccount: () => tx.ledgerAccount.deleteMany({ where: { schoolId: sid } }),
      AccountingSettings: () => tx.accountingSettings.deleteMany({ where: { schoolId: sid } }),
      Payslip: () => tx.payslip.deleteMany({ where: { runId: { in: existingRuns } } }),
      PayrollRun: () => tx.payrollRun.deleteMany({ where: { schoolId: sid } }),
      StaffPayItem: () => tx.staffPayItem.deleteMany({ where: { staffId: { in: existingStaff } } }),
      HrSettings: () => tx.hrSettings.deleteMany({ where: { schoolId: sid } }),
      IdCardSettings: () => tx.idCardSettings.deleteMany({ where: { schoolId: sid } }),
      ReportRemark: () => tx.reportRemark.deleteMany({ where: { studentId: { in: existingStudents } } }),
      ReportSettings: () => tx.reportSettings.deleteMany({ where: { schoolId: sid } }),
      InvoicePayment: () => tx.invoicePayment.deleteMany({ where: { invoice: { schoolId: sid } } }),
      Invoice: () => tx.invoice.deleteMany({ where: { schoolId: sid } }),
      AuditLog: () => tx.auditLog.deleteMany({ where: { schoolId: sid } }),
      SmsLog: () => tx.smsLog.deleteMany({ where: { schoolId: sid } }),
      Notification: () => tx.notification.deleteMany({ where: { userId: { in: existingUsers } } }),
      Announcement: () => tx.announcement.deleteMany({ where: { schoolId: sid } }),
      Event: () => tx.event.deleteMany({ where: { schoolId: sid } }),
      StudentRoute: () => tx.studentRoute.deleteMany({ where: { studentId: { in: existingStudents } } }),
      VehicleRoute: () => tx.vehicleRoute.deleteMany({ where: { routeId: { in: existingRoutes } } }),
      Vehicle: () => tx.vehicle.deleteMany({ where: { schoolId: sid } }),
      TransportRoute: () => tx.transportRoute.deleteMany({ where: { schoolId: sid } }),
      RoomAssignment: () => tx.roomAssignment.deleteMany({ where: { studentId: { in: existingStudents } } }),
      Room: () => tx.room.deleteMany({ where: { dormitoryId: { in: existingDorms } } }),
      Dormitory: () => tx.dormitory.deleteMany({ where: { schoolId: sid } }),
      BookIssue: () => tx.bookIssue.deleteMany({ where: { bookId: { in: existingBooks } } }),
      Book: () => tx.book.deleteMany({ where: { schoolId: sid } }),
      FeePayment: () => tx.feePayment.deleteMany({ where: { studentId: { in: existingStudents } } }),
      FeeStructure: () => tx.feeStructure.deleteMany({ where: { schoolId: sid } }),
      ExamResult: () => tx.examResult.deleteMany({ where: { studentId: { in: existingStudents } } }),
      Exam: () => tx.exam.deleteMany({ where: { id: { in: existingExams } } }),
      LeaveRequest: () => tx.leaveRequest.deleteMany({ where: { staffId: { in: existingStaff } } }),
      StaffAttendance: () => tx.staffAttendance.deleteMany({ where: { staffId: { in: existingStaff } } }),
      Attendance: () => tx.attendance.deleteMany({ where: { studentId: { in: existingStudents } } }),
      Message: () => tx.message.deleteMany({ where: { schoolId: sid } }),
      Assignment: () => tx.assignment.deleteMany({ where: { schoolId: sid } }),
      SeatPlan: () => tx.seatPlan.deleteMany({ where: { classId: { in: existingClasses } } }),
      TimetableSlot: () => tx.timetableSlot.deleteMany({ where: { classId: { in: existingClasses } } }),
      StudentGuardian: () => tx.studentGuardian.deleteMany({ where: { studentId: { in: existingStudents } } }),
      Guardian: () => tx.guardian.deleteMany({ where: { id: { in: existingGuardians } } }),
      Student: () => tx.student.deleteMany({ where: { schoolId: sid } }),
      StaffSubject: () => tx.staffSubject.deleteMany({ where: { staffId: { in: existingStaff } } }),
      ClassSubject: () => tx.classSubject.deleteMany({ where: { classId: { in: existingClasses } } }),
      Subject: () => tx.subject.deleteMany({ where: { schoolId: sid } }),
      Class: () => tx.class.deleteMany({ where: { schoolId: sid } }),
      Staff: () => tx.staff.deleteMany({ where: { schoolId: sid } }),
      Term: () => tx.term.deleteMany({ where: { academicYearId: { in: existingYears } } }),
      AcademicYear: () => tx.academicYear.deleteMany({ where: { schoolId: sid } }),
      User: () => tx.user.deleteMany({ where: { schoolId: sid } }),
      SchoolSubscription: () => tx.schoolSubscription.deleteMany({ where: { schoolId: sid } }),
      School: () => tx.school.deleteMany({ where: { id: sid } }),
    }

    let removed = 0
    for (const table of DELETE_ORDER) {
      const fn = del[table]
      if (!fn) continue
      const r = await fn()
      removed += r.count
    }
    console.log(`\n  removed ${removed} existing row(s) for this school`)

    // Reinsert parents first.
    for (const table of [...DELETE_ORDER].reverse()) {
      const rows = backup.tables[table] ?? []
      if (!rows.length) continue
      for (let i = 0; i < rows.length; i += 500) {
        // Backups taken before FeePayment carried schoolId (Sept 2026) get it from the school being restored.
        const slice = rows.slice(i, i + 500).map(revive).map((r) => (table === 'FeePayment' && r.schoolId == null ? { ...r, schoolId: sid } : r))
        const cols = Object.keys(slice[0]).map((c) => `"${c}"`).join(', ')
        const values = slice.map((r) => `(${Object.values(r).map(quoteValue).join(', ')})`).join(', ')
        await tx.$executeRawUnsafe(`INSERT INTO "${table}" (${cols}) VALUES ${values}`)
      }
      console.log(`  ${table.padEnd(20)} ${rows.length}`)
    }
  }, { timeout: 120_000 })

  const others = await prisma.school.count({ where: { id: { not: backup.schoolId } } })
  console.log(`\nrestored ${totalRows} rows for ${backup.schoolName}`)
  console.log(`${others} other tenant(s) untouched`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('restore failed — the transaction rolled back, nothing changed:', e)
  await prisma.$disconnect()
  process.exit(1)
})
