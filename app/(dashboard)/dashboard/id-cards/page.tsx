import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { loadIdCardConfig } from '@/lib/id-cards/settings'
import { IdCardsClient } from './id-cards-client'

export const dynamic = 'force-dynamic'

/** Issue ID cards: pick pupils by class (or staff), add photos, download cards or A4 sheets. */
export default async function IdCardsPage() {
  const session = await requirePageRole(ROLES.idCards)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const [config, school, classes, staff] = await Promise.all([
    loadIdCardConfig(schoolId),
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, motto: true, city: true, region: true, address: true, phone: true, email: true, logoUrl: true } }),
    prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } } }),
    prisma.staff.findMany({ where: { schoolId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, employeeNo: true, role: true, phone: true, photoUrl: true } }),
  ])

  return (
    <IdCardsClient
      config={config}
      school={school ?? { name: 'School', motto: null, city: null, region: null, address: null, phone: null, email: null, logoUrl: null }}
      classes={classes.map((c) => ({ id: c.id, name: c.name, count: c._count.students }))}
      staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, employeeNo: s.employeeNo, role: s.role, phone: s.phone, photoUrl: s.photoUrl }))}
    />
  )
}
