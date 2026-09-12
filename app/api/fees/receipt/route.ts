export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { record } from '@/lib/audit'
import { pupilAccess, fmtDate } from '@/lib/pupil-access'
import { billingFor } from '@/lib/fees/billing'
import { startDoc, header, detailRows, table, text, textRight, rule, gap, footer, tzs, attachment, SCHOOL_HEADER_SELECT } from '@/lib/pdf'

/**
 * Receipt for one fee payment, A4, on the school letterhead.
 *   GET /api/fees/receipt?paymentId=…
 * Office and accountant for any pupil of the school; a pupil for their own;
 * a guardian for their children. The balance line uses the pupil's fee
 * structures at print time, like the statement.
 */
export async function GET(req: Request) {
  const session = await auth()
  const paymentId = new URL(req.url).searchParams.get('paymentId') ?? ''
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
  const payment = await prisma.feePayment.findUnique({ where: { id: paymentId }, include: { feeStructure: { select: { name: true } }, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, classId: true, class: { select: { name: true } }, school: { select: SCHOOL_HEADER_SELECT } } } } })
  if (!payment) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  const access = await pupilAccess(session, payment.studentId, ['SCHOOL_ADMIN', 'ACCOUNTANT'])
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const limited = rateLimit(req, 'report', session!.user.id)
  if (limited) return limited

  const s = payment.student
  const bill = (await billingFor(s.id, { asAt: payment.paidAt }))!
  const billed = bill.billed, paidToDate = bill.paid
  const receiptNo = payment.receiptNo ?? `RCP-${payment.id.slice(-8).toUpperCase()}`

  // Name the person on the paper: the primary guardian when one is linked, otherwise the pupil's family.
  const primary = await prisma.studentGuardian.findFirst({ where: { studentId: s.id }, orderBy: { isPrimary: 'desc' }, select: { guardian: { select: { firstName: true, lastName: true, relationship: true } } } })
  const payer = primary ? `${primary.guardian.firstName} ${primary.guardian.lastName}${primary.guardian.relationship ? ` (${primary.guardian.relationship})` : ''} — for ${s.firstName} ${s.lastName}` : `Parent/guardian of ${s.firstName} ${s.lastName}`
  const doc = await startDoc(`Receipt ${receiptNo}`, s.school)
  header(doc, s.school, 'Official Receipt')
  detailRows(doc, [
    ['RECEIPT NO', receiptNo],
    ['DATE', fmtDate(payment.paidAt)],
    ['RECEIVED FROM', payer],
    ['ADMISSION NO', s.admissionNo],
    ['CLASS', s.class?.name ?? 'Unassigned'],
    ['PAYMENT METHOD', payment.paymentMethod.replace(/_/g, ' ') + (payment.transactionRef ? ` · ref ${payment.transactionRef}` : '')],
  ])
  gap(doc, 10)
  table(doc, [{ title: 'DESCRIPTION', width: 429 }, { title: 'AMOUNT', width: 70, align: 'right' }], [[payment.feeStructure?.name ?? 'School fees', tzs(payment.amount)]])
  const right = 595.28 - 48
  text(doc, 'Amount received', { size: 11, bold: true }); textRight(doc, tzs(payment.amount), right, { size: 12, bold: true }); gap(doc, 18)
  rule(doc); gap(doc, 14)
  text(doc, bill.discount ? `Total billed to date (after ${bill.discountPct}% sibling discount)` : 'Total billed to date', { size: 9 }); textRight(doc, tzs(billed), right, { size: 9 }); gap(doc, 13)
  text(doc, 'Total paid to date (incl. this receipt)', { size: 9 }); textRight(doc, tzs(paidToDate), right, { size: 9 }); gap(doc, 13)
  text(doc, 'Balance after this payment', { size: 9, bold: true }); textRight(doc, tzs(Math.max(0, billed - paidToDate)), right, { size: 9, bold: true }); gap(doc, 22)
  if (payment.remarks) { text(doc, `Remarks: ${payment.remarks}`, { size: 8.5 }); gap(doc, 14) }
  text(doc, 'Thank you. Keep this receipt as proof of payment.', { size: 8.5 })
  footer(doc, `${s.school.name} · Receipt ${receiptNo} · ${s.admissionNo}`)

  if (session!.user.role !== 'STUDENT') await record(session!, { action: 'export', entity: 'FeePayment', entityId: payment.id, summary: `Printed receipt ${receiptNo} for ${s.firstName} ${s.lastName}` })
  const bytes = await doc.pdf.save()
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(`receipt-${receiptNo}.pdf`) } })
}
