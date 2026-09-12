export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { billingFor, ordinal } from '@/lib/fees/billing'
import { record } from '@/lib/audit'
import {
  startDoc, header, detailRows, table, footer, text, textRight, gap, rule,
  ensureRoom, attachment, tzs, ACCENT, SOFT,
} from '@/lib/pdf'

/**
 * Fee statement as a PDF: what was billed, what has been paid with receipt
 * numbers, and the balance outstanding.
 *
 * Staff (admin/accountant) can print any pupil's; a pupil can print their own.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const role = session.user.role
  let schoolId = session.user.schoolId
  if (!schoolId) return NextResponse.json({ error: 'No school' }, { status: 400 })

  const staff = role === 'SCHOOL_ADMIN' || role === 'ACCOUNTANT'
  const own = await prisma.student.findFirst({ where: { userId: session.user.id, schoolId }, select: { id: true } })

  const targetId = studentId ?? own?.id
  if (!targetId) return NextResponse.json({ error: 'Student id is required' }, { status: 400 })
  if (!staff && own?.id !== targetId) {
    // A guardian may print their own children, in whichever school each child attends.
    const link = role === 'PARENT' ? await prisma.studentGuardian.findFirst({ where: { studentId: targetId, guardian: { userId: session.user.id } }, select: { student: { select: { schoolId: true } } } }) : null
    if (!link) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    schoolId = link.student.schoolId
  }

  const student = await prisma.student.findFirst({
    where: { id: targetId, schoolId },
    include: {
      class: true,
      school: true,
      feePayments: {
        orderBy: { paidAt: 'asc' },
        include: { feeStructure: { select: { name: true } } },
      },
    },
  })
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Billed, sibling discount, paid and balance all come from the one billing helper.
  const bill = (await billingFor(student.id))!
  const billed = bill.billed, paid = bill.paid, balance = bill.balance

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      timeZone: process.env.SCHOOL_TIMEZONE || 'Africa/Dar_es_Salaam',
    })

  const doc = await startDoc(`Fee statement — ${student.firstName} ${student.lastName}`, student.school)
  header(doc, student.school, 'Fee Statement')

  detailRows(doc, [
    ['NAME', `${student.firstName} ${student.lastName}`],
    ['ADMISSION NO', student.admissionNo],
    ['CLASS', student.class?.name ?? 'Unassigned'],
    ['STATEMENT DATE', fmtDate(new Date())],
  ])
  gap(doc, 10)

  text(doc, 'CHARGES', { size: 8, bold: true, color: SOFT })
  gap(doc, 16)
  table(
    doc,
    bill.discount
      ? [{ title: 'FEE', width: 209 }, { title: 'APPLIES TO', width: 80 }, { title: 'AMOUNT', width: 70, align: 'right' }, { title: 'DISCOUNT', width: 70, align: 'right' }, { title: 'NET', width: 70, align: 'right' }]
      : [{ title: 'FEE', width: 349 }, { title: 'APPLIES TO', width: 80 }, { title: 'AMOUNT', width: 70, align: 'right' }],
    bill.lines.map((l) => bill.discount
      ? [l.name, l.classId ? student.class?.name ?? 'Class' : 'All classes', tzs(l.amount), l.discount ? `-${tzs(l.discount)} (${l.discountPct}%)` : '—', tzs(l.net)]
      : [l.name, l.classId ? student.class?.name ?? 'Class' : 'All classes', tzs(l.amount)]),
    { emptyMessage: 'No fee structures apply to this pupil yet.' }
  )
  if (bill.discount) { text(doc, `Sibling discount: ${ordinal(bill.rank)} child of ${bill.siblings.length + 1} in the family — ${bill.discountPct}% off discountable fees.`, { size: 8.5, color: SOFT }); gap(doc, 14) }

  text(doc, 'PAYMENTS RECEIVED', { size: 8, bold: true, color: SOFT })
  gap(doc, 16)
  table(
    doc,
    [
      { title: 'DATE', width: 80 },
      { title: 'RECEIPT', width: 130 },
      { title: 'FEE', width: 139 },
      { title: 'METHOD', width: 80 },
      { title: 'AMOUNT', width: 70, align: 'right' },
    ],
    student.feePayments.map((p) => [
      fmtDate(p.paidAt),
      p.receiptNo ?? '—',
      p.feeStructure?.name ?? 'Fee',
      p.paymentMethod.replace(/_/g, ' '),
      tzs(p.amount),
    ]),
    { emptyMessage: 'No payments have been recorded against this pupil.' }
  )

  ensureRoom(doc, 80)
  const right = 595.28 - 48
  text(doc, 'Total billed', { size: 9.5 })
  textRight(doc, tzs(billed), right, { size: 9.5, bold: true })
  gap(doc, 15)
  text(doc, 'Total paid', { size: 9.5 })
  textRight(doc, tzs(paid), right, { size: 9.5, bold: true })
  gap(doc, 12)
  rule(doc)
  gap(doc, 16)
  text(doc, balance > 0 ? 'Balance outstanding' : 'Balance', { size: 11, bold: true })
  textRight(doc, tzs(balance), right, { size: 12, bold: true, color: ACCENT })
  gap(doc, 24)
  if (balance > 0) {
    text(doc, 'Please settle the outstanding balance at the school office or by mobile money.', { size: 8.5, color: SOFT })
  } else {
    text(doc, 'This account is fully settled. Thank you.', { size: 8.5, color: SOFT })
  }

  footer(doc, `${student.school.name} · Fee statement for ${student.admissionNo} · Not a receipt`)

  const bytes = await doc.pdf.save()

  await record(session, {
    action: 'create',
    entity: 'FeeStatement',
    entityId: student.id,
    summary: `Generated a fee statement for ${student.firstName} ${student.lastName} (balance ${tzs(balance)})`,
  })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachment(`fee-statement-${student.admissionNo}.pdf`),
      'Cache-Control': 'no-store',
    },
  })
}
