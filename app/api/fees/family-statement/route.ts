export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { record } from '@/lib/audit'
import { fmtDate } from '@/lib/pupil-access'
import { familyBilling, ordinal } from '@/lib/fees/billing'
import { startDoc, header, detailRows, table, text, textRight, rule, gap, footer, tzs, attachment, SCHOOL_HEADER_SELECT, ensureRoom } from '@/lib/pdf'

/**
 * One statement for the whole family: every child of a guardian in one
 * school, each with billed / sibling discount / paid / balance, and the total.
 *   GET /api/fees/family-statement?guardianId=…&schoolId=…   (office, accountant)
 *   GET /api/fees/family-statement?schoolId=…                (a guardian, for themself; schoolId optional)
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const role = session.user.role
  let guardianId = searchParams.get('guardianId') ?? ''
  let schoolId = searchParams.get('schoolId') ?? ''
  if (role === 'PARENT') {
    const g = await prisma.guardian.findFirst({ where: { userId: session.user.id }, select: { id: true, students: { select: { student: { select: { schoolId: true } } } } } })
    if (!g) return NextResponse.json({ error: 'No guardian record' }, { status: 404 })
    guardianId = g.id
    const schools = [...new Set(g.students.map((s) => s.student.schoolId))]
    if (!schoolId) schoolId = schools[0] ?? ''
    if (!schools.includes(schoolId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else if (role === 'SCHOOL_ADMIN' || role === 'ACCOUNTANT') {
    schoolId = session.user.schoolId ?? ''
    if (!guardianId) return NextResponse.json({ error: 'guardianId is required' }, { status: 400 })
    const g = await prisma.guardian.findFirst({ where: { id: guardianId, students: { some: { student: { schoolId } } } }, select: { id: true } })
    if (!g) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })
  } else return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const limited = rateLimit(req, 'report', session.user.id)
  if (limited) return limited

  const [guardian, school, fam] = await Promise.all([
    prisma.guardian.findUnique({ where: { id: guardianId }, select: { firstName: true, lastName: true, phone: true, relationship: true } }),
    prisma.school.findUnique({ where: { id: schoolId }, select: SCHOOL_HEADER_SELECT }),
    familyBilling(guardianId, schoolId),
  ])
  if (!guardian || !school) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const doc = await startDoc(`Family statement — ${guardian.firstName} ${guardian.lastName}`, school)
  header(doc, school, 'Family Fee Statement')
  detailRows(doc, [
    ['GUARDIAN', `${guardian.firstName} ${guardian.lastName}${guardian.relationship ? ` (${guardian.relationship})` : ''}`],
    ['PHONE', guardian.phone],
    ['CHILDREN', String(fam.children.length)],
    ['STATEMENT DATE', fmtDate(new Date())],
  ])
  gap(doc, 10)
  table(doc, [{ title: 'CHILD', width: 169 }, { title: 'CLASS', width: 70 }, { title: 'FEES', width: 65, align: 'right' }, { title: 'DISCOUNT', width: 65, align: 'right' }, { title: 'PAID', width: 65, align: 'right' }, { title: 'BALANCE', width: 65, align: 'right' }],
    fam.children.map((c) => [`${c.name} (${c.admissionNo})${c.billing.discountPct ? ` · ${ordinal(c.billing.rank)} child` : ''}`, c.className ?? '—', tzs(c.billing.gross), c.billing.discount ? `-${tzs(c.billing.discount)}` : '—', tzs(c.billing.paid), tzs(c.billing.balance)]),
    { emptyMessage: 'No active pupils are linked to this guardian in this school.' })
  ensureRoom(doc, 90)
  const right = 595.28 - 48
  text(doc, 'Family fees', { size: 9.5 }); textRight(doc, tzs(fam.gross), right, { size: 9.5, bold: true }); gap(doc, 15)
  if (fam.discount) { text(doc, 'Sibling discount', { size: 9.5 }); textRight(doc, `-${tzs(fam.discount)}`, right, { size: 9.5, bold: true }); gap(doc, 15) }
  text(doc, 'Total paid', { size: 9.5 }); textRight(doc, tzs(fam.paid), right, { size: 9.5, bold: true }); gap(doc, 12)
  rule(doc); gap(doc, 16)
  text(doc, 'Family balance', { size: 12, bold: true }); textRight(doc, tzs(Math.max(0, fam.balance)), right, { size: 13, bold: true }); gap(doc, 22)
  text(doc, 'One payment may be made for the family; quote each child\'s admission number so it is allocated correctly.', { size: 8.5 })
  footer(doc, `${school.name} · Family statement · ${guardian.firstName} ${guardian.lastName}`)
  await record(session, { action: 'export', entity: 'Guardian', entityId: guardianId, summary: `Printed a family statement for ${guardian.firstName} ${guardian.lastName} (${fam.children.length} children)` })
  const bytes = await doc.pdf.save()
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(`family-statement-${guardian.lastName}.pdf`) } })
}
