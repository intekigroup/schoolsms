import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { ExamsClient } from './exams-client'
import { teachingScope, classFilter, type TeachingScope } from '@/lib/teaching'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

/** `canTeach` as a Prisma `where`, so the page can count and skip in the database instead of filtering in memory. */
function examFilter(scope: TeachingScope) {
  if (scope.all) return {}
  return { OR: [
    { classId: { in: scope.classTeacherOf } },
    ...scope.assignments.map((a) => (a.classId ? { classId: a.classId, subjectId: a.subjectId } : { subjectId: a.subjectId })),
  ] }
}

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requirePageRole(ROLES.exams)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const params = await searchParams
  const page = pageParam(params)
  const query = ((Array.isArray(params.q) ? params.q[0] : params.q) ?? '').trim()
  const scope = await teachingScope(session)
  const where = {
    class: { schoolId, ...classFilter(scope) },
    ...examFilter(scope),
    ...(query ? { AND: [{ OR: [
      { name: { contains: query, mode: 'insensitive' as const } },
      { class: { name: { contains: query, mode: 'insensitive' as const } } },
      { subject: { name: { contains: query, mode: 'insensitive' as const } } },
    ] }] } : {}),
  }
  const [total, exams] = await Promise.all([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      include: { class: { include: { _count: { select: { students: { where: { status: 'ACTIVE' } } } } } }, subject: true, _count: { select: { results: true } } },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page),
    }),
  ])

  const classes = await prisma.class.findMany({ where: { schoolId, ...classFilter(scope) }, orderBy: { name: 'asc' } })
  const allSubjects = await prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' } })
  // A teacher only sets exams in subjects they teach (class teachers: any subject in their class).
  const subjects = scope.all || scope.classTeacherOf.length ? allSubjects : allSubjects.filter((s) => scope.assignments.some((a) => a.subjectId === s.id))
  const academicYears = await prisma.academicYear.findMany({ where: { schoolId }, include: { terms: true }, orderBy: { startDate: 'desc' } })

  const data = exams.map((e: any) => ({
    id: e.id, name: e.name, type: e.type,
    className: e.class?.name ?? '', subjectName: e.subject?.name ?? '',
    totalMarks: e.totalMarks, resultCount: e._count?.results ?? 0, expected: e.class?._count?.students ?? 0,
    date: e.date?.toISOString() ?? '', termId: e.termId ?? '', status: e.status, reviewNote: e.reviewNote ?? null,
  }))

  return <ExamsClient
    isAdmin={scope.all}
    exams={data}
    page={page} pageSize={PAGE_SIZE} total={total} query={query}
    classes={classes.map((c: any) => ({ id: c.id, name: c.name }))}
    subjects={subjects.map((s: any) => ({ id: s.id, name: s.name }))}
    academicYears={academicYears.map((ay: any) => ({ id: ay.id, name: ay.name, terms: (ay.terms ?? []).map((t: any) => ({ id: t.id, name: t.name })) }))}
  />
}
