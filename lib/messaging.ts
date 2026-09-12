import type { Session } from 'next-auth'
import { prisma } from '@/lib/db'
import { teachingScope } from '@/lib/teaching'

/**
 * Who may message whom. Every message is about one pupil:
 *   – a guardian may write to the class teacher, the teachers of the class, and the office;
 *   – a teacher may write to the guardians (with logins) of pupils on their teaching load;
 *   – the office may write to any guardian of any pupil.
 * Both directions are derived from the same `contactsFor`, so a reply is always allowed.
 */
export interface Contact { userId: string; name: string; role: string; studentId: string; studentName: string; className: string | null; relation: string }

export async function contactsFor(session: Session): Promise<Contact[]> {
  const schoolId = session.user.schoolId
  if (!schoolId) return []
  const role = session.user.role

  if (role === 'PARENT') {
    const guardian = await prisma.guardian.findFirst({ where: { userId: session.user.id }, select: { students: { select: { student: { select: { id: true, firstName: true, lastName: true, schoolId: true, classId: true, class: { select: { name: true, classTeacherId: true } } } } } } } })
    if (!guardian) return []
    const out: Contact[] = []
    // One guardian login may have children in several schools: contacts come from each child's own school.
    const adminsBySchool = new Map<string, { id: string; name: string | null }[]>()
    for (const { student } of guardian.students) {
      const sid = student.schoolId
      if (!adminsBySchool.has(sid)) adminsBySchool.set(sid, await prisma.user.findMany({ where: { schoolId: sid, role: 'SCHOOL_ADMIN', isActive: true }, select: { id: true, name: true } }))
      const admins = adminsBySchool.get(sid)!
      const studentName = `${student.firstName} ${student.lastName}`
      const staff = student.classId
        ? await prisma.staff.findMany({
            where: { schoolId: sid, userId: { not: null }, user: { isActive: true }, OR: [{ classTeacher: { id: student.classId } }, { subjectAssignments: { some: { OR: [{ classId: student.classId }, { classId: null }] } } }, { timetableSlots: { some: { classId: student.classId } } }] },
            select: { id: true, firstName: true, lastName: true, userId: true, classTeacher: { select: { id: true } } },
          })
        : []
      for (const s of staff) out.push({ userId: s.userId!, name: `${s.firstName} ${s.lastName}`, role: 'TEACHER', studentId: student.id, studentName, className: student.class?.name ?? null, relation: s.classTeacher?.id === student.classId ? 'Class teacher' : 'Teacher' })
      for (const a of admins) out.push({ userId: a.id, name: a.name ?? 'School office', role: 'SCHOOL_ADMIN', studentId: student.id, studentName, className: student.class?.name ?? null, relation: 'School office' })
    }
    return out
  }

  if (role === 'TEACHER' || role === 'SCHOOL_ADMIN') {
    const scope = await teachingScope(session)
    if (!scope.all && scope.classIds.length === 0) return []
    const links = await prisma.studentGuardian.findMany({
      where: { student: { schoolId, status: 'ACTIVE', ...(scope.all ? {} : { classId: { in: scope.classIds } }) }, guardian: { userId: { not: null }, user: { isActive: true } } },
      select: { isPrimary: true, guardian: { select: { userId: true, firstName: true, lastName: true, relationship: true } }, student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } } },
      orderBy: [{ student: { lastName: 'asc' } }, { isPrimary: 'desc' }],
    })
    return links.map((l) => ({ userId: l.guardian.userId!, name: `${l.guardian.firstName} ${l.guardian.lastName}`, role: 'PARENT', studentId: l.student.id, studentName: `${l.student.firstName} ${l.student.lastName}`, className: l.student.class?.name ?? null, relation: l.guardian.relationship ?? (l.isPrimary ? 'Primary guardian' : 'Guardian') }))
  }
  return []
}

export async function canMessage(session: Session, studentId: string, recipientId: string): Promise<boolean> {
  const contacts = await contactsFor(session)
  return contacts.some((c) => c.studentId === studentId && c.userId === recipientId)
}
