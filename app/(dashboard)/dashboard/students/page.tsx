import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { StudentsClient } from './students-client'
import { teachingScope, classFilter, studentFilter } from '@/lib/teaching'

export const dynamic = 'force-dynamic'

/**
 * Server-side pagination. Loading every student rendered ~4 MB of HTML at 1,500
 * students and grew linearly with enrolment — unusable on the mobile connections
 * these schools actually run on.
 */
const PAGE_SIZE = 50

export default async function StudentsPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await requirePageRole(ROLES.studentsRead)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const params = await searchParams
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q
  const query = (rawQuery ?? '').trim()
  const rawClass = Array.isArray(params.classId) ? params.classId[0] : params.classId
  const classId = (rawClass ?? '').trim()

  const scope = await teachingScope(session)
  // A teacher may only narrow to a class on their load; anyone else to any class in the school.
  const classPick = classId && (scope.all || scope.classIds.includes(classId)) ? { classId } : {}
  const where = {
    schoolId,
    ...studentFilter(scope),
    ...classPick,
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' as const } },
            { lastName: { contains: query, mode: 'insensitive' as const } },
            { admissionNo: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, students, classes] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: { class: true, user: { select: { email: true, isActive: true } } },
      // Teachers read a class list: class by class, alphabetical. The office keeps newest first.
      orderBy: scope.all ? { createdAt: 'desc' } : [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.class.findMany({ where: { schoolId, ...classFilter(scope) }, orderBy: { name: 'asc' } }),
  ])

  // Siblings = other active pupils of this school sharing a guardian; shown as a chip so the office sees families at a glance.
  const links = await prisma.studentGuardian.findMany({ where: { studentId: { in: students.map((s: any) => s.id) } }, select: { studentId: true, guardianId: true } })
  const guardianIds = [...new Set(links.map((l) => l.guardianId))]
  const famLinks = guardianIds.length ? await prisma.studentGuardian.findMany({ where: { guardianId: { in: guardianIds }, student: { schoolId, status: 'ACTIVE' } }, select: { guardianId: true, student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } } } }) : []
  const siblingsOf = (id: string) => { const gs = new Set(links.filter((l) => l.studentId === id).map((l) => l.guardianId)); const seen = new Map<string, { id: string; name: string; className: string | null }>(); for (const l of famLinks) if (gs.has(l.guardianId) && l.student.id !== id) seen.set(l.student.id, { id: l.student.id, name: `${l.student.firstName} ${l.student.lastName}`, className: l.student.class?.name ?? null }); return [...seen.values()] }
  const data = students.map((s: any) => ({
    id: s.id,
    admissionNo: s.admissionNo,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth?.toISOString() ?? '',
    className: s.class?.name ?? 'Unassigned',
    classId: s.classId ?? '',
    status: s.status,
    phone: '',
    loginEmail: s.user?.email ?? null,
    siblings: siblingsOf(s.id),
  }))

  const classOptions = classes.map((c: any) => ({ id: c.id, name: c.name }))

  return (
    <StudentsClient
      students={data}
      classes={classOptions}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      query={query}
      classId={classPick.classId ?? ''}
      readOnly={!scope.all}
      groupByClass={!scope.all}
    />
  )
}
