import type { Session } from 'next-auth'
import { prisma } from '@/lib/db'

/**
 * What a signed-in staff member teaches. Admins see the whole school; a
 * teacher sees the classes they are class teacher of, the classes and
 * subjects assigned to them under Teaching load, and any class on their
 * timetable. Every teacher-facing page and API narrows by this, so a
 * teacher's account is shaped like a teacher's day, not a small admin's.
 */
export interface TeachingScope {
  /** True for roles that see everything (SCHOOL_ADMIN, SUPER_ADMIN). */
  all: boolean
  staffId: string | null
  /** Classes the teacher is class teacher of. */
  classTeacherOf: string[]
  /** Every class the teacher may see (class teacher + assignments + timetable). */
  classIds: string[]
  /** Subject assignments; classId null = the subject in every class. */
  assignments: { classId: string | null; subjectId: string }[]
}

export async function teachingScope(session: Session): Promise<TeachingScope> {
  const role = session.user.role
  const schoolId = session.user.schoolId
  if (role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN') return { all: true, staffId: null, classTeacherOf: [], classIds: [], assignments: [] }
  if (!schoolId) return { all: false, staffId: null, classTeacherOf: [], classIds: [], assignments: [] }
  const staff = await prisma.staff.findFirst({
    where: { userId: session.user.id, schoolId },
    select: {
      id: true,
      classTeacher: { select: { id: true } },
      subjectAssignments: { select: { classId: true, subjectId: true } },
      timetableSlots: { select: { classId: true } },
    },
  })
  if (!staff) return { all: false, staffId: null, classTeacherOf: [], classIds: [], assignments: [] }
  const classTeacherOf = staff.classTeacher ? [staff.classTeacher.id] : []
  const fromAssignments = staff.subjectAssignments.map((a) => a.classId).filter((c): c is string => !!c)
  const fromTimetable = staff.timetableSlots.map((s) => s.classId)
  // A subject assigned "in every class" opens every class that offers it.
  const schoolWide = staff.subjectAssignments.filter((a) => !a.classId).map((a) => a.subjectId)
  const viaSubject = schoolWide.length
    ? (await prisma.classSubject.findMany({ where: { subjectId: { in: schoolWide }, class: { schoolId } }, select: { classId: true } })).map((c) => c.classId)
    : []
  const classIds = [...new Set([...classTeacherOf, ...fromAssignments, ...fromTimetable, ...viaSubject])]
  return { all: false, staffId: staff.id, classTeacherOf, classIds, assignments: staff.subjectAssignments }
}

export function canSeeClass(scope: TeachingScope, classId: string | null | undefined) {
  if (scope.all) return true
  return !!classId && scope.classIds.includes(classId)
}

/** May this teacher set exams / enter marks for the subject in the class? Class teachers may for every subject in their class. */
export function canTeach(scope: TeachingScope, classId: string, subjectId: string) {
  if (scope.all) return true
  if (scope.classTeacherOf.includes(classId)) return true
  return scope.assignments.some((a) => a.subjectId === subjectId && (a.classId === null || a.classId === classId))
}

/** Prisma `where` fragment restricting classes to the scope. */
export function classFilter(scope: TeachingScope) {
  return scope.all ? {} : { id: { in: scope.classIds } }
}

export function studentFilter(scope: TeachingScope) {
  return scope.all ? {} : { classId: { in: scope.classIds } }
}

/**
 * Classes a non-staff viewer may look at: a pupil's own class, or a guardian's
 * children's classes — across every school the children attend, since one
 * parent login may have children in several Shule SMS schools.
 */
export async function viewerClasses(session: Session): Promise<{ id: string; name: string; schoolId: string; schoolName: string; studentName: string }[]> {
  const role = session.user.role
  if (role === 'STUDENT') {
    const s = await prisma.student.findFirst({ where: { userId: session.user.id }, select: { firstName: true, lastName: true, class: { select: { id: true, name: true, schoolId: true, school: { select: { name: true } } } } } })
    return s?.class ? [{ id: s.class.id, name: s.class.name, schoolId: s.class.schoolId, schoolName: s.class.school.name, studentName: `${s.firstName} ${s.lastName}` }] : []
  }
  if (role === 'PARENT') {
    const links = await prisma.studentGuardian.findMany({ where: { guardian: { userId: session.user.id }, student: { status: 'ACTIVE' } }, select: { student: { select: { firstName: true, lastName: true, class: { select: { id: true, name: true, schoolId: true, school: { select: { name: true } } } } } } } })
    const out = new Map<string, { id: string; name: string; schoolId: string; schoolName: string; studentName: string }>()
    for (const { student } of links) if (student.class) out.set(student.class.id, { id: student.class.id, name: student.class.name, schoolId: student.class.schoolId, schoolName: student.class.school.name, studentName: `${student.firstName} ${student.lastName}` })
    return [...out.values()]
  }
  return []
}

export const isViewerRole = (role: string | undefined) => role === 'STUDENT' || role === 'PARENT'
