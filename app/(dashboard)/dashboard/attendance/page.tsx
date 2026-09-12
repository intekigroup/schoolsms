import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { AttendanceClient } from './attendance-client'
import { teachingScope, classFilter } from '@/lib/teaching'

export const dynamic = 'force-dynamic'

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const session = await requirePageRole(ROLES.attendance)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const scope = await teachingScope(session)
  const { classId } = await searchParams
  const classes = await prisma.class.findMany({
    where: { schoolId, ...classFilter(scope) },
    include: { students: { where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    orderBy: { name: 'asc' },
  })

  const classData = classes.map((c: any) => ({
    id: c.id,
    name: c.name,
    students: (c.students ?? []).map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo })),
  }))

  // Class teachers land on their own class; a ?classId link (from the teacher home) wins.
  const initial = classId && classData.some((c) => c.id === classId) ? classId : scope.classTeacherOf.find((id) => classData.some((c) => c.id === id))
  return <AttendanceClient classes={initial ? [...classData.filter((c) => c.id === initial), ...classData.filter((c) => c.id !== initial)] : classData} />
}
