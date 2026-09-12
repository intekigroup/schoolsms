import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { TeachersClient } from './teachers-client'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requirePageRole(ROLES.staff)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const params = await searchParams
  const page = pageParam(params)
  const query = ((Array.isArray(params.q) ? params.q[0] : params.q) ?? '').trim()
  const where = {
    schoolId,
    ...(query ? { OR: [
      { firstName: { contains: query, mode: 'insensitive' as const } },
      { lastName: { contains: query, mode: 'insensitive' as const } },
      { employeeNo: { contains: query, mode: 'insensitive' as const } },
    ] } : {}),
  }

  const [total, staff, classes, subjects] = await Promise.all([
    prisma.staff.count({ where }),
    prisma.staff.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(page), include: { user: { select: { email: true, role: true, isActive: true } }, classTeacher: { select: { name: true } }, _count: { select: { subjectAssignments: true } } } }),
    prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  const data = staff.map((s: any) => ({
    id: s.id,
    employeeNo: s.employeeNo,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    role: s.role,
    phone: s.phone ?? '',
    qualification: s.qualification ?? '',
    status: s.status,
    salary: s.salary,
    loginEmail: s.user?.isActive ? s.user.email : null,
    loginRole: s.user?.isActive ? s.user.role : null,
    classTeacherOf: s.classTeacher?.name ?? null,
    subjectCount: s._count?.subjectAssignments ?? 0,
  }))

  return <TeachersClient staff={data} classes={classes} subjects={subjects} page={page} pageSize={PAGE_SIZE} total={total} query={query} />
}
