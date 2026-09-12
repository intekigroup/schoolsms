import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { billingFor } from '@/lib/fees/billing'
import { MyClient } from './my-client'

export const dynamic = 'force-dynamic'

/**
 * The student's own view. Until now a STUDENT could reach exactly one page (the
 * school-wide timetable) and see nothing about themselves — no grades, no
 * attendance, no fee balance — despite every model already existing.
 */
export default async function MyPage() {
  const session = await requirePageRole(ROLES.ownRecord)
  const userId = session.user.id
  const schoolId = session.user.schoolId

  const student = await prisma.student.findFirst({
    where: { userId },
    include: {
      class: true,
      examResults: {
        where: { exam: { status: 'PUBLISHED' } },
        orderBy: { id: 'desc' },
        take: 20,
        include: { exam: { select: { name: true, totalMarks: true } }, subject: { select: { name: true } } },
      },
      attendances: { orderBy: { date: 'desc' }, take: 200, select: { status: true, date: true } },
      feePayments: { orderBy: { paidAt: 'desc' }, include: { feeStructure: { select: { name: true } } } },
      bookIssues: {
        where: { returnDate: null },
        include: { book: { select: { title: true, author: true } } },
      },
    },
  })

  if (!student) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">My Records</h1>
        <p className="text-muted-foreground">
          This account is not linked to a student record yet. Ask the school office to connect it.
        </p>
      </div>
    )
  }

  // Attendance rate: present or late both count as attended.
  const total = student.attendances.length
  const attended = student.attendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length
  const attendanceRate = total ? Math.round((attended / total) * 100) : null

  // Billed (net of any sibling discount) and paid come from the shared billing helper.
  const bill = await billingFor(student.id)
  const billed = bill?.billed ?? 0
  const paid = bill?.paid ?? student.feePayments.reduce((sum, p) => sum + p.amount, 0)

  const timetable = student.classId
    ? await prisma.timetableSlot.findMany({
        where: { classId: student.classId },
        include: { subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      })
    : []

  const homework = student.classId && schoolId ? await prisma.assignment.findMany({ where: { schoolId, classId: student.classId, visibleToGuardians: true }, orderBy: { createdAt: 'desc' }, take: 30, include: { subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } } }) : []

  return (
    <MyClient
      homework={homework.map((h) => ({ id: h.id, kind: h.kind, title: h.title, description: h.description, subjectName: h.subject?.name ?? null, teacher: h.staff ? `${h.staff.firstName} ${h.staff.lastName}` : null, dueDate: h.dueDate?.toISOString() ?? null }))}
      name={`${student.firstName} ${student.lastName}`}
      admissionNo={student.admissionNo}
      className={student.class?.name ?? 'Unassigned'}
      attendanceRate={attendanceRate}
      attendanceCounts={{
        present: student.attendances.filter((a) => a.status === 'PRESENT').length,
        late: student.attendances.filter((a) => a.status === 'LATE').length,
        absent: student.attendances.filter((a) => a.status === 'ABSENT').length,
        total,
      }}
      fees={{ billed, paid, balance: billed - paid }}
      results={student.examResults.map((r) => ({
        id: r.id,
        subject: r.subject?.name ?? '—',
        exam: r.exam?.name ?? '—',
        marks: r.marks,
        outOf: r.exam?.totalMarks ?? 100,
        grade: r.grade ?? '—',
      }))}
      payments={student.feePayments.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.feeStructure?.name ?? 'Fee',
        amount: p.amount,
        receiptNo: p.receiptNo ?? '—',
        paidAt: p.paidAt.toISOString().slice(0, 10),
      }))}
      loans={student.bookIssues.map((b) => ({
        id: b.id,
        title: b.book?.title ?? 'Book',
        author: b.book?.author ?? '',
        dueDate: b.dueDate.toISOString().slice(0, 10),
        overdue: b.dueDate < new Date(),
      }))}
      timetable={timetable.map((s) => ({
        id: s.id,
        day: s.dayOfWeek,
        start: s.startTime,
        end: s.endTime,
        subject: s.subject?.name ?? '—',
        teacher: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '',
        room: s.room ?? '',
      }))}
    />
  )
}
