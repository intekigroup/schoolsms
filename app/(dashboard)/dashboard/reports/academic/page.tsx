import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { AcademicReportsClient } from './academic-client'
import { teachingScope, classFilter } from '@/lib/teaching'

export const dynamic = 'force-dynamic'

/**
 * Class results: rankings, remarks and the printable academic reports.
 * Teachers and admins both use it (ROLES.academicsRead), unlike the finance
 * reports page.
 */
export default async function AcademicReportsPage() {
  const session = await requirePageRole(ROLES.academicsRead)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const scope = await teachingScope(session)
  const [classes, years] = await Promise.all([
    prisma.class.findMany({ where: { schoolId, ...classFilter(scope) }, orderBy: { name: 'asc' }, select: { id: true, name: true, level: true } }),
    prisma.academicYear.findMany({
      where: { schoolId }, orderBy: { startDate: 'desc' },
      select: { id: true, name: true, isCurrent: true, terms: { orderBy: { startDate: 'asc' }, select: { id: true, name: true } } },
    }),
  ])

  return (
    <AcademicReportsClient
      classes={classes}
      years={years}
      canEditRemarks={session.user.role === 'SCHOOL_ADMIN' || session.user.role === 'TEACHER'}
      classTeacherOf={scope.all ? classes.map((c) => c.id) : scope.classTeacherOf}
      isAdmin={scope.all}
    />
  )
}
