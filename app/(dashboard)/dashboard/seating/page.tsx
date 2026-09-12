import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { teachingScope, classFilter } from '@/lib/teaching'
import { SeatingClient } from './seating-client'

export const dynamic = 'force-dynamic'

/** Seating plans: drag pupils onto seats; class teachers and the office edit, other teachers of the class view. */
export default async function SeatingPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const session = await requirePageRole(ROLES.classesRead)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>
  const scope = await teachingScope(session)
  const classes = await prisma.class.findMany({ where: { schoolId, ...classFilter(scope) }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
  const { classId } = await searchParams
  const initial = classId && classes.some((c) => c.id === classId) ? classId : scope.classTeacherOf.find((id) => classes.some((c) => c.id === id)) ?? classes[0]?.id ?? ''
  return <SeatingClient classes={classes} initialClassId={initial} />
}
