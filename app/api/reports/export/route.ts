import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(r.map(esc).join(','))
  return lines.join('\n')
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.reports)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

  // Exports are expensive; limit the person, not the address they share.
  const limited = rateLimit(req, 'export', guard.session.user.id)
  if (limited) return limited

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'students'

    let csv = ''
    let filename = 'report.csv'

    if (type === 'students') {
      const students = await prisma.student.findMany({
        where: { schoolId },
        include: { class: true },
        orderBy: { admissionNo: 'asc' },
      })
      csv = toCsv(
        ['Admission No', 'First Name', 'Last Name', 'Gender', 'Class', 'Status'],
        students.map((s: any) => [s.admissionNo, s.firstName, s.lastName, s.gender, s.class?.name ?? '', s.status]),
      )
      filename = 'students.csv'
    } else if (type === 'fees') {
      const payments = await prisma.feePayment.findMany({
        where: { student: { schoolId } },
        include: { student: true, feeStructure: true },
        orderBy: { paidAt: 'desc' },
      })
      csv = toCsv(
        ['Receipt No', 'Student', 'Amount (TZS)', 'Method', 'Status', 'Fee Type', 'Paid At'],
        payments.map((p: any) => [
          p.receiptNo ?? '', `${p.student?.firstName ?? ''} ${p.student?.lastName ?? ''}`.trim(),
          p.amount, p.paymentMethod, p.paymentStatus, p.feeStructure?.name ?? '', fmtDate(p.paidAt),
        ]),
      )
      filename = 'financial-summary.csv'
    } else if (type === 'attendance') {
      const records = await prisma.attendance.findMany({
        where: { class: { schoolId } },
        include: { student: true, class: true },
        orderBy: { date: 'desc' },
        take: 5000,
      })
      csv = toCsv(
        ['Date', 'Student', 'Class', 'Status'],
        records.map((a: any) => [fmtDate(a.date), `${a.student?.firstName ?? ''} ${a.student?.lastName ?? ''}`.trim(), a.class?.name ?? '', a.status]),
      )
      filename = 'attendance.csv'
    } else if (type === 'staff') {
      const staff = await prisma.staff.findMany({ where: { schoolId }, orderBy: { employeeNo: 'asc' } })
      csv = toCsv(
        ['Employee No', 'First Name', 'Last Name', 'Role', 'Salary (TZS)', 'Status', 'Phone'],
        staff.map((s: any) => [s.employeeNo, s.firstName, s.lastName, s.role, s.salary, s.status, s.phone ?? '']),
      )
      filename = 'staff-payroll.csv'
    } else if (type === 'library') {
      const issues = await prisma.bookIssue.findMany({
        where: { book: { schoolId } },
        include: { book: true, student: true },
        orderBy: { issueDate: 'desc' },
      })
      csv = toCsv(
        ['Book', 'Student', 'Issue Date', 'Due Date', 'Return Date', 'Fine (TZS)', 'Status'],
        issues.map((i: any) => [
          i.book?.title ?? '', `${i.student?.firstName ?? ''} ${i.student?.lastName ?? ''}`.trim(),
          fmtDate(i.issueDate), fmtDate(i.dueDate), fmtDate(i.returnDate), i.fine,
          i.returnDate ? 'Returned' : 'Out',
        ]),
      )
      filename = 'library-report.csv'
    } else if (type === 'grades') {
      const results = await prisma.examResult.findMany({
        where: { exam: { class: { schoolId } } },
        include: { student: true, exam: true, subject: true },
        orderBy: { marks: 'desc' },
      })
      csv = toCsv(
        ['Student', 'Exam', 'Subject', 'Marks', 'Grade'],
        results.map((r: any) => [
          `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
          r.exam?.name ?? '', r.subject?.name ?? '', r.marks, r.grade ?? '',
        ]),
      )
      filename = 'student-performance.csv'
    } else {
      return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    console.error('Reports export error:', e)
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 })
  }
}
