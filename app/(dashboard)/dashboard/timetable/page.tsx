import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { TimetableClient } from './timetable-client'
import { teachingScope, classFilter, viewerClasses, isViewerRole } from '@/lib/teaching'

export const dynamic = 'force-dynamic'

/**
 * Timetable builder (admins: drag subjects into periods, move lessons, spot
 * clashes) and week views by class or by teacher. Teachers see the classes
 * they teach and their own week, read-only.
 */
export default async function TimetablePage() {
  const session = await requirePageRole(ROLES.timetableRead)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  if (isViewerRole(session.user.role)) {
    // A pupil sees their class; a guardian sees each child's class (possibly in different schools).
    const mine = await viewerClasses(session)
    const slots = mine.length ? await prisma.timetableSlot.findMany({ where: { classId: { in: mine.map((c) => c.id) } }, include: { subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } }, class: { select: { name: true } } } }) : []
    const manySchools = new Set(mine.map((c) => c.schoolId)).size > 1
    return (
      <TimetableClient
        classes={mine.map((c) => ({ id: c.id, name: `${c.name} · ${c.studentName}${manySchools ? ` (${c.schoolName})` : ''}`, subjectIds: [] }))}
        subjects={[]} teachers={[]} load={[]} readOnly mine={null} viewer
        slots={slots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, room: s.room ?? '', classId: s.classId, className: s.class.name, subjectId: s.subjectId, subjectName: s.subject?.name ?? '', staffId: s.staffId, teacherName: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '' }))}
      />
    )
  }

  const scope = await teachingScope(session)
  const [classes, subjects, staff, slots, load] = await Promise.all([
    prisma.class.findMany({ where: { schoolId, ...classFilter(scope) }, orderBy: { name: 'asc' }, select: { id: true, name: true, subjects: { select: { subjectId: true } } } }),
    prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
    prisma.timetableSlot.findMany({
      where: { class: { schoolId } },
      include: { subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } }, class: { select: { name: true } } },
    }),
    prisma.staffSubject.findMany({ where: { staff: { schoolId } }, select: { staffId: true, subjectId: true, classId: true } }),
  ])
  const visible = new Set(classes.map((c) => c.id))

  return (
    <TimetableClient
      classes={classes.map((c) => ({ id: c.id, name: c.name, subjectIds: c.subjects.map((s) => s.subjectId) }))}
      subjects={subjects}
      teachers={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))}
      // Admins see every slot (needed for clash detection across classes); a teacher only the slots of classes they can see.
      slots={slots.filter((s) => scope.all || visible.has(s.classId)).map((s) => ({
        id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, room: s.room ?? '',
        classId: s.classId, className: s.class.name, subjectId: s.subjectId, subjectName: s.subject?.name ?? '',
        staffId: s.staffId, teacherName: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '',
      }))}
      load={load}
      readOnly={!scope.all}
      mine={scope.staffId}
    />
  )
}
