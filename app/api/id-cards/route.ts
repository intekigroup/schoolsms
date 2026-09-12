export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { record } from '@/lib/audit'
import { attachment } from '@/lib/pdf'
import { formatDate } from '@/lib/format'
import { loadIdCardConfig } from '@/lib/id-cards/settings'
import { renderIdCards, type CardHolder } from '@/lib/id-cards/render'

/**
 * ID cards as PDF.
 *
 *   GET ?type=student&classId=…           every active pupil in the class
 *   GET ?type=student&ids=a,b,c           chosen pupils
 *   GET ?type=student&all=1               every active pupil in the school
 *   GET ?type=staff&ids=…|all=1           staff likewise
 *   &layout=card|sheet                    CR80 pages (default) or A4 sheets
 *
 * Capped at 500 cards per request; a bigger school prints class by class.
 */
const MAX = 500

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.idCards)
  if (!guard.ok) return guard.response
  const limited = rateLimit(req, 'report', guard.session.user.id)
  if (limited) return limited
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const layout = searchParams.get('layout') === 'sheet' ? 'sheet' : 'card'
  const ids = (searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const classId = searchParams.get('classId')
  const all = searchParams.get('all') === '1'
  if (type !== 'student' && type !== 'staff') return NextResponse.json({ error: 'type must be student or staff' }, { status: 400 })
  if (!ids.length && !classId && !all) return NextResponse.json({ error: 'Give ids, classId or all=1' }, { status: 400 })

  const [config, school] = await Promise.all([
    loadIdCardConfig(schoolId),
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, motto: true, address: true, city: true, region: true, phone: true, email: true, website: true, logoUrl: true } }),
  ])
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  let holders: CardHolder[] = []
  let label = ''
  if (type === 'student') {
    const students = await prisma.student.findMany({
      where: { schoolId, status: 'ACTIVE', ...(ids.length ? { id: { in: ids } } : {}), ...(classId ? { classId } : {}) },
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
      take: MAX + 1,
      select: {
        id: true, firstName: true, lastName: true, admissionNo: true, gender: true, dateOfBirth: true, photoUrl: true,
        class: { select: { name: true } },
        guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { firstName: true, lastName: true, phone: true } } } },
      },
    })
    const s = config.student
    holders = students.map((p) => {
      const g = p.guardians[0]?.guardian
      const fields: [string, string][] = []
      if (s.showAdmissionNo) fields.push(['Admission no', p.admissionNo])
      if (s.showClass) fields.push(['Class', p.class?.name ?? 'Unassigned'])
      if (s.showDateOfBirth) fields.push(['Date of birth', formatDate(p.dateOfBirth)])
      if (s.showGender) fields.push(['Gender', p.gender === 'MALE' ? 'Male' : p.gender === 'FEMALE' ? 'Female' : String(p.gender)])
      if (s.showGuardianPhone && g) fields.push(['Guardian', `${g.firstName} ${g.lastName} · ${g.phone}`])
      return {
        kind: 'student' as const, id: p.id, name: `${p.firstName} ${p.lastName}`, subtitle: p.class?.name ?? null, photoUrl: p.photoUrl,
        fields, emergency: g ? `${g.firstName} ${g.lastName} · ${g.phone}` : null,
      }
    })
    label = classId ? (students[0]?.class?.name ?? 'class') : all ? 'all-students' : 'students'
  } else {
    const staff = await prisma.staff.findMany({
      where: { schoolId, status: 'ACTIVE', ...(ids.length ? { id: { in: ids } } : {}) },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: MAX + 1,
      select: { id: true, firstName: true, lastName: true, employeeNo: true, role: true, phone: true, photoUrl: true },
    })
    const s = config.staff
    holders = staff.map((p) => {
      const fields: [string, string][] = []
      if (s.showEmployeeNo) fields.push(['Employee no', p.employeeNo])
      if (s.showRole) fields.push(['Position', p.role])
      if (s.showPhone && p.phone) fields.push(['Phone', p.phone])
      return { kind: 'staff' as const, id: p.id, name: `${p.firstName} ${p.lastName}`, subtitle: s.showRole ? p.role : null, photoUrl: p.photoUrl, fields, emergency: null }
    })
    label = all ? 'all-staff' : 'staff'
  }
  if (holders.length === 0) return NextResponse.json({ error: 'No active records matched' }, { status: 404 })
  if (holders.length > MAX) return NextResponse.json({ error: `More than ${MAX} cards — print class by class` }, { status: 400 })

  const origin = process.env.APP_URL || new URL(req.url).origin
  const bytes = await renderIdCards(holders, { config, school, origin, layout })
  await record(guard.session, {
    action: 'create', entity: 'IdCard', entityId: holders.length === 1 ? holders[0].id : null,
    summary: `Generated ${holders.length} ${type} ID card(s) (${layout})`,
  })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachment(`id-cards-${label}${layout === 'sheet' ? '-sheet' : ''}.pdf`),
      'Cache-Control': 'no-store',
    },
  })
}
