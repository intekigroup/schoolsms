import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { teachingScope, classFilter } from '@/lib/teaching'
import { HomeworkClient } from './homework-client'

export const dynamic = 'force-dynamic'

/** Homework & lesson notes: post to a class, optionally per subject; guardians and pupils see them on their portals. */
export default async function HomeworkPage() {
  const session = await requirePageRole(ROLES.homework)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>
  const scope = await teachingScope(session)
  const [classes, subjects] = await Promise.all([
    prisma.class.findMany({ where: { schoolId, ...classFilter(scope) }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  // A teacher's subject picker only offers what they teach (class teachers may post for any subject in their class).
  const teachable = classes.map((c) => ({ classId: c.id, subjectIds: scope.all || scope.classTeacherOf.includes(c.id) ? subjects.map((s) => s.id) : subjects.filter((s) => scope.assignments.some((a) => a.subjectId === s.id && (a.classId === null || a.classId === c.id))).map((s) => s.id) }))
  return <HomeworkClient classes={classes} subjects={subjects} teachable={teachable} me={session.user.id} isAdmin={scope.all} />
}
