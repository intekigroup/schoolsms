export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { record } from '@/lib/audit'
import { pupilAccess, fmtDate } from '@/lib/pupil-access'
import { billingFor, ordinal } from '@/lib/fees/billing'
import { startDoc, header, detailRows, table, text, textRight, rule, gap, footer, tzs, attachment, SCHOOL_HEADER_SELECT, ensureRoom } from '@/lib/pdf'

/**
 * Fee invoice for one pupil: every fee that applies to their class, what has
 * been paid against each, and the balance due — the paper a parent takes to
 * the bank or the office.
 *   GET /api/fees/invoice?studentId=…
 * Numbered deterministically (INV-<admission>-<yyyymm>) so re-printing the
 * same month's invoice never mints a new number.
 */
export async function GET(req: Request) {
  const session = await auth()
  const studentId = new URL(req.url).searchParams.get('studentId') ?? ''
  if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 })
  const access = await pupilAccess(session, studentId, ['SCHOOL_ADMIN', 'ACCOUNTANT'])
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const limited = rateLimit(req, 'report', session!.user.id)
  if (limited) return limited

  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true, admissionNo: true, classId: true, class: { select: { name: true } }, school: { select: SCHOOL_HEADER_SELECT }, feePayments: { select: { amount: true, feeStructureId: true } } } })
  if (!s) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  const bill = (await billingFor(s.id))!
  const lines = bill.lines.map((l) => ({ name: l.name, due: l.dueDate, amount: l.amount, discount: l.discount, net: l.net, paid: l.paid, balance: l.balance }))
  const billed = bill.billed, paid = bill.paid, balance = bill.balance
  const now = new Date()
  const invoiceNo = `INV-${s.admissionNo}-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const nextDue = lines.filter((l) => l.balance > 0 && l.due).map((l) => l.due!).sort((a, b) => a.getTime() - b.getTime())[0]

  // Name the person on the paper: the primary guardian when one is linked, otherwise the pupil's family.
  const primary = await prisma.studentGuardian.findFirst({ where: { studentId: s.id }, orderBy: { isPrimary: 'desc' }, select: { guardian: { select: { firstName: true, lastName: true, relationship: true } } } })
  const payer = primary ? `${primary.guardian.firstName} ${primary.guardian.lastName}${primary.guardian.relationship ? ` (${primary.guardian.relationship})` : ''} — for ${s.firstName} ${s.lastName}` : `Parent/guardian of ${s.firstName} ${s.lastName}`
  const doc = await startDoc(`Invoice ${invoiceNo}`, s.school)
  header(doc, s.school, 'Fee Invoice')
  detailRows(doc, [
    ['INVOICE NO', invoiceNo],
    ['INVOICE DATE', fmtDate(now)],
    ['BILL TO', payer],
    ['ADMISSION NO', s.admissionNo],
    ['CLASS', s.class?.name ?? 'Unassigned'],
    ['DUE DATE', nextDue ? fmtDate(nextDue) : balance > 0 ? 'On receipt' : '—'],
  ])
  gap(doc, 10)
  table(doc, bill.discount
      ? [{ title: 'FEE', width: 149 }, { title: 'DUE', width: 70 }, { title: 'AMOUNT', width: 70, align: 'right' }, { title: 'DISCOUNT', width: 70, align: 'right' }, { title: 'PAID', width: 70, align: 'right' }, { title: 'BALANCE', width: 70, align: 'right' }]
      : [{ title: 'FEE', width: 219 }, { title: 'DUE', width: 70 }, { title: 'AMOUNT', width: 70, align: 'right' }, { title: 'PAID', width: 70, align: 'right' }, { title: 'BALANCE', width: 70, align: 'right' }],
    lines.map((l) => bill.discount
      ? [l.name, l.due ? fmtDate(l.due) : '—', tzs(l.amount), l.discount ? `-${tzs(l.discount)}` : '—', tzs(l.paid), tzs(l.balance)]
      : [l.name, l.due ? fmtDate(l.due) : '—', tzs(l.amount), tzs(l.paid), tzs(l.balance)]), { emptyMessage: 'No fees have been set for this pupil\'s class yet.' })
  if (bill.discount) { text(doc, `Sibling discount applied: ${bill.discountPct}% (${ordinal(bill.rank)} child in the family).`, { size: 8.5 }); gap(doc, 14) }
  ensureRoom(doc, 90)
  const right = 595.28 - 48
  text(doc, 'Total billed', { size: 9.5 }); textRight(doc, tzs(bill.gross), right, { size: 9.5, bold: true }); gap(doc, 15)
  if (bill.discount) { text(doc, 'Sibling discount', { size: 9.5 }); textRight(doc, `-${tzs(bill.discount)}`, right, { size: 9.5, bold: true }); gap(doc, 15) }
  text(doc, 'Total paid', { size: 9.5 }); textRight(doc, tzs(paid), right, { size: 9.5, bold: true }); gap(doc, 12)
  rule(doc); gap(doc, 16)
  text(doc, 'Amount due', { size: 12, bold: true }); textRight(doc, tzs(Math.max(0, balance)), right, { size: 13, bold: true }); gap(doc, 22)
  text(doc, balance > 0 ? 'Please pay at the school office or by mobile money, quoting the admission number. A receipt is issued for every payment.' : 'This account is fully paid. Thank you.', { size: 8.5 })
  footer(doc, `${s.school.name} · Invoice ${invoiceNo} · ${s.admissionNo} · Not a receipt`)

  if (session!.user.role !== 'STUDENT') await record(session!, { action: 'export', entity: 'Student', entityId: s.id, summary: `Printed invoice ${invoiceNo} for ${s.firstName} ${s.lastName}` })
  const bytes = await doc.pdf.save()
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(`invoice-${invoiceNo}.pdf`) } })
}
