import { requirePageRole, ROLES } from '@/lib/authz'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { teachingScope } from '@/lib/teaching'
import { ParentsClient } from './parents-client'
import { billingFor, type Billing } from '@/lib/fees/billing'
import { DirectoryPaginator } from './directory-paginator'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

function gradeFromPct(pct: number): string {
  if (pct >= 75) return 'A'
  if (pct >= 65) return 'B'
  if (pct >= 45) return 'C'
  if (pct >= 30) return 'D'
  return 'F'
}

export default async function ParentPortalPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requirePageRole(ROLES.parents)
  const schoolId = session.user.schoolId
  const userId = session.user.id
  const role = session.user.role
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  // Find the guardian linked to this logged-in user. One login may have children in
  // several Shule SMS schools, so everything below is keyed by each child's own school.
  const guardian = userId
    ? await prisma.guardian.findFirst({
        where: { userId },
        include: {
          students: {
            include: {
              student: {
                include: {
                  class: true,
                  school: { select: { id: true, name: true } },
                  attendances: { orderBy: { date: 'desc' }, take: 200 },
                  examResults: {
                    where: { exam: { status: 'PUBLISHED' } },
                    include: { exam: { include: { term: { select: { id: true, name: true, academicYear: { select: { name: true } } } } } }, subject: true },
                    orderBy: { exam: { date: 'desc' } },
                    take: 6,
                  },
                  feePayments: { orderBy: { paidAt: 'desc' }, include: { feeStructure: { select: { name: true } } } },
                },
              },
            },
          },
        },
      })
    : null
  const childSchoolIds = [...new Set((guardian?.students ?? []).map((sg: any) => sg.student.schoolId as string))]
  const schoolIds = role === 'PARENT' && childSchoolIds.length ? childSchoolIds : [schoolId]

  // Recent announcements visible to parents, from every school the children attend.
  const announcements = await prisma.announcement.findMany({
    where: { schoolId: { in: schoolIds } },
    include: { school: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 8,
  })
  const announcementData = announcements.map((a: any) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    isPublic: a.isPublic,
    createdAt: a.createdAt.toISOString(),
    schoolName: schoolIds.length > 1 ? a.school.name : null,
  }))

  // Fee structures per school (to compute dues) and published terms per class (for report cards).
  const feeStructures = await prisma.feeStructure.findMany({ where: { schoolId: { in: schoolIds } } })
  const childClassIdsAll = [...new Set((guardian?.students ?? []).map((sg: any) => sg.student.classId).filter(Boolean))] as string[]
  const publishedTerms = childClassIdsAll.length ? await prisma.exam.findMany({ where: { classId: { in: childClassIdsAll }, status: 'PUBLISHED', termId: { not: null } }, select: { classId: true, term: { select: { id: true, name: true, startDate: true, academicYear: { select: { name: true } } } } }, distinct: ['classId', 'termId'] }) : []
  const timetable = childClassIdsAll.length ? await prisma.timetableSlot.findMany({ where: { classId: { in: childClassIdsAll } }, include: { subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }) : []

  const bills = new Map<string, Billing>()
  for (const sg of guardian?.students ?? []) { const b = await billingFor(sg.student.id); if (b) bills.set(sg.student.id, b) }
  function buildChild(s: any) {
    // Attendance %
    const total = s.attendances.length
    const present = s.attendances.filter((a: any) => a.status === 'PRESENT' || a.status === 'LATE').length
    const attendancePct = total > 0 ? Math.round((present / total) * 100) : null

    // Fees — billed net of the sibling discount, from the shared helper
    const bill = bills.get(s.id)
    const dueTotal = bill?.billed ?? feeStructures.filter((f: any) => f.schoolId === s.schoolId && (f.classId === s.classId || f.classId === null)).reduce((sum: number, f: any) => sum + f.amount, 0)
    const paid = s.feePayments.reduce((sum: number, p: any) => sum + p.amount, 0)
    const balance = dueTotal - paid

    // Grades
    const grades = s.examResults.map((r: any) => {
      const totalMarks = r.exam?.totalMarks || 100
      const pct = totalMarks > 0 ? (r.marks / totalMarks) * 100 : 0
      return {
        id: r.id,
        exam: r.exam?.name ?? 'Exam',
        subject: r.subject?.name ?? 'Subject',
        marks: r.marks,
        totalMarks,
        grade: r.grade || gradeFromPct(pct),
      }
    })

    const terms = publishedTerms.filter((t) => t.classId === s.classId && t.term).map((t) => t.term!).sort((a, b) => b.startDate.getTime() - a.startDate.getTime()).map((t) => ({ id: t.id, name: `${t.name} ${t.academicYear.name}` }))
    return {
      id: s.id,
      classId: s.classId ?? null,
      schoolId: s.schoolId,
      schoolName: s.school?.name ?? '',
      name: `${s.firstName} ${s.lastName}`,
      admissionNo: s.admissionNo,
      className: s.class?.name ?? 'Unassigned',
      photoUrl: s.photoUrl ?? null,
      attendancePct,
      attendanceTotal: total,
      dueTotal,
      paid,
      balance,
      grades,
      terms,
      discount: bill?.discount ?? 0,
      discountPct: bill?.discountPct ?? 0,
      familyRank: bill?.rank ?? 1,
      familySize: (bill?.siblings.length ?? 0) + 1,
      payments: s.feePayments.map((p: any) => ({ id: p.id, paidAt: p.paidAt.toISOString(), receiptNo: p.receiptNo ?? null, fee: p.feeStructure?.name ?? 'Fee', method: String(p.paymentMethod).replace(/_/g, ' '), amount: p.amount })),
      timetable: timetable.filter((t) => t.classId === s.classId).map((t) => ({ id: t.id, dayOfWeek: t.dayOfWeek, startTime: t.startTime, endTime: t.endTime, room: t.room ?? '', subject: t.subject?.name ?? '', teacher: t.staff ? `${t.staff.firstName} ${t.staff.lastName}` : '' })),
    }
  }

  const children = guardian
    ? guardian.students.map((sg: any) => buildChild(sg.student))
    : []

  // Admin / staff view: directory of guardians in the school, one page at a time
  let directory: any[] = []
  let studentOptions: { id: string; name: string; admissionNo: string }[] = []
  const isStaffView = children.length === 0 && role !== 'PARENT'
  const scope = await teachingScope(session)
  const directoryPage = pageParam(await searchParams)
  let directoryTotal = 0
  if (isStaffView) {
    // Teachers see the guardians of pupils on their teaching load only.
    const where = { students: { some: { student: { schoolId, ...(scope.all ? {} : { classId: { in: scope.classIds } }) } } } }
    directoryTotal = await prisma.guardian.count({ where })
    const guardians = await prisma.guardian.findMany({
      where,
      include: {
        students: { include: { student: { include: { class: true } } } },
      },
      orderBy: { firstName: 'asc' },
      ...pageArgs(directoryPage),
    })
    directory = guardians.map((g: any) => ({
      id: g.id,
      name: `${g.firstName} ${g.lastName}`,
      phone: g.phone,
      email: g.email ?? null,
      relationship: g.relationship ?? null,
      linked: g.userId ? true : false,
      children: g.students.map((sg: any) => ({
        id: sg.student.id,
        name: `${sg.student.firstName} ${sg.student.lastName}`,
        className: sg.student.class?.name ?? 'Unassigned',
        isPrimary: sg.isPrimary,
      })),
      address: g.address ?? '',
      occupation: g.occupation ?? '',
    }))

    studentOptions = (
      await prisma.student.findMany({
        where: { schoolId },
        select: { id: true, firstName: true, lastName: true, admissionNo: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      })
    ).map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo }))
  }

  // Homework and notes for the children's classes (guardian-visible only).
  const childClassIds = [...new Set(children.map((c: any) => c.classId).filter(Boolean))] as string[]
  const homework = childClassIds.length ? await prisma.assignment.findMany({ where: { schoolId: { in: schoolIds }, classId: { in: childClassIds }, visibleToGuardians: true }, orderBy: [{ createdAt: 'desc' }], take: 30, include: { class: { select: { name: true } }, subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } } }) : []

  return (
    <>
    {isStaffView && <DirectoryPaginator page={directoryPage} pageSize={PAGE_SIZE} total={directoryTotal} />}
    <ParentsClient
      homework={homework.map((h) => ({ id: h.id, kind: h.kind, title: h.title, description: h.description, className: h.class.name, subjectName: h.subject?.name ?? null, teacher: h.staff ? `${h.staff.firstName} ${h.staff.lastName}` : null, dueDate: h.dueDate?.toISOString() ?? null, createdAt: h.createdAt.toISOString() }))}
      childrenData={children}
      directory={directory}
      studentOptions={studentOptions}
      isStaffView={isStaffView}
      announcements={announcementData}
      manySchools={schoolIds.length > 1}
      familySchools={role === 'PARENT' ? [...new Set(children.map((c: any) => c.schoolId))].map((id) => ({ id, name: children.find((c: any) => c.schoolId === id)?.schoolName ?? '', children: children.filter((c: any) => c.schoolId === id).length })).filter((s) => s.children > 1) : []}
    />
    </>
  )
}
