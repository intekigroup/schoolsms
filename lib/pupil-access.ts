import type { Session } from 'next-auth'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { teachingScope, canSeeClass } from '@/lib/teaching'

/**
 * Who may open a document about one pupil (receipt, invoice, statement,
 * report card): staff of the pupil's school with the right role, the pupil
 * themself, or a guardian linked to them — in whichever school the pupil
 * attends, since a guardian's login may belong to another school.
 */
export type PupilAccess =
  | { ok: true; schoolId: string; viewer: 'staff' | 'self' | 'guardian' }
  | { ok: false; status: 401 | 403 | 404; error: string }

export async function pupilAccess(session: Session | null, studentId: string, staffRoles: readonly UserRole[], opts: { teacherScoped?: boolean } = {}): Promise<PupilAccess> {
  if (!session?.user) return { ok: false, status: 401, error: 'Unauthorized' }
  const role = session.user.role
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, schoolId: true, classId: true, userId: true } })
  if (!student) return { ok: false, status: 404, error: 'Student not found' }
  if (staffRoles.includes(role)) {
    if (student.schoolId !== session.user.schoolId) return { ok: false, status: 404, error: 'Student not found' }
    if (opts.teacherScoped && role === 'TEACHER' && !canSeeClass(await teachingScope(session), student.classId)) return { ok: false, status: 403, error: 'This pupil is not in a class on your teaching load' }
    return { ok: true, schoolId: student.schoolId, viewer: 'staff' }
  }
  if (role === 'STUDENT' && student.userId === session.user.id) return { ok: true, schoolId: student.schoolId, viewer: 'self' }
  if (role === 'PARENT') {
    const link = await prisma.studentGuardian.findFirst({ where: { studentId, guardian: { userId: session.user.id } }, select: { id: true } })
    if (link) return { ok: true, schoolId: student.schoolId, viewer: 'guardian' }
  }
  return { ok: false, status: 403, error: 'Forbidden' }
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: process.env.SCHOOL_TIMEZONE || 'Africa/Dar_es_Salaam' })
