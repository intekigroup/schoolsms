import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { ClassesClient } from './classes-client'
import { teachingScope, classFilter } from '@/lib/teaching'

export const dynamic = 'force-dynamic'

export default async function ClassesPage() {
  const session = await requirePageRole(ROLES.classesRead)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const scope = await teachingScope(session)
  const [classes, staff] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId, ...classFilter(scope) },
      include: {
        _count: { select: { students: true } }, classTeacher: true, subjects: { include: { subject: true } },
        monitor: { select: { id: true, firstName: true, lastName: true } }, monitress: { select: { id: true, firstName: true, lastName: true } },
        students: { where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, gender: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.staff.findMany({ where: { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
  ])

  const data = classes.map((c: any) => ({
    id: c.id, name: c.name, level: c.level, stream: c.stream ?? '',
    capacity: c.capacity, studentCount: c._count?.students ?? 0,
    classTeacher: c.classTeacher ? `${c.classTeacher.firstName} ${c.classTeacher.lastName}` : 'None',
    classTeacherId: c.classTeacherId ?? '',
    monitorId: c.monitorId ?? '', monitor: c.monitor ? `${c.monitor.firstName} ${c.monitor.lastName}` : '',
    monitressId: c.monitressId ?? '', monitress: c.monitress ? `${c.monitress.firstName} ${c.monitress.lastName}` : '',
    pupils: (c.students ?? []).map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, gender: s.gender })),
    subjects: (c.subjects ?? []).map((cs: any) => cs.subject?.name).filter(Boolean),
  }))

  return <ClassesClient classes={data} staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} readOnly={!scope.all} />
}
