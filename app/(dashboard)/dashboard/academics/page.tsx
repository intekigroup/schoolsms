import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { AcademicsClient } from './academics-client'

export const dynamic = 'force-dynamic'

export default async function AcademicsPage() {
  const session = await requirePageRole(ROLES.academicsRead)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const [subjects, years] = await Promise.all([
    prisma.subject.findMany({
      where: { schoolId },
      include: { _count: { select: { classes: true, exams: true, timetableSlots: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.academicYear.findMany({
      where: { schoolId },
      include: {
        terms: { orderBy: { startDate: 'asc' }, include: { _count: { select: { exams: true } } } },
        _count: { select: { exams: true } },
      },
      orderBy: { startDate: 'desc' },
    }),
  ])

  const canWrite = session.user.role === 'SCHOOL_ADMIN' || session.user.role === 'SUPER_ADMIN'

  return (
    <AcademicsClient
      canWrite={canWrite}
      subjects={subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code ?? '',
        description: s.description ?? '',
        classCount: s._count.classes,
        examCount: s._count.exams,
        slotCount: s._count.timetableSlots,
      }))}
      years={years.map((y) => ({
        id: y.id,
        name: y.name,
        startDate: y.startDate.toISOString().slice(0, 10),
        endDate: y.endDate.toISOString().slice(0, 10),
        isCurrent: y.isCurrent,
        examCount: y._count.exams,
        terms: y.terms.map((t) => ({
          id: t.id,
          name: t.name,
          startDate: t.startDate.toISOString().slice(0, 10),
          endDate: t.endDate.toISOString().slice(0, 10),
          isCurrent: t.isCurrent,
          examCount: t._count.exams,
        })),
      }))}
    />
  )
}
