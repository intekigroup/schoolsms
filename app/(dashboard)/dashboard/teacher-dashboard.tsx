import Link from 'next/link'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { teachingScope } from '@/lib/teaching'
import { loadHrConfig } from '@/lib/hr/settings'
import { leaveBalances } from '@/lib/hr/leave'
import { schoolTodayStart, schoolTodayEnd, SCHOOL_TIMEZONE } from '@/lib/school-time'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarCheck, ClipboardEdit, Clock, Megaphone, Plane, Users } from 'lucide-react'

/**
 * A teacher's landing page: today's lessons, registers still to mark, marks
 * still to enter, leave balance, latest notices. Everything is narrowed to
 * the teacher's own classes by `teachingScope`.
 */
export async function TeacherDashboard({ session }: { session: Session }) {
  const t = (key: string, vars?: Record<string, string | number>) => tr(key, (session.user.locale as Locale) ?? 'en', vars)
  const schoolId = session.user.schoolId!
  const scope = await teachingScope(session)
  if (!scope.staffId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Welcome, {session.user.name}</h1>
        <p className="mt-2 text-muted-foreground">Your login is not yet linked to a staff record, so there is nothing to show. Ask the school office to open <strong>Teachers &amp; Staff → Access &amp; teaching</strong> for you.</p>
      </div>
    )
  }
  const now = new Date()
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIMEZONE }).format(now)
  const dow = (new Date(`${todayIso}T12:00:00Z`).getUTCDay() + 6) % 7 + 1 // 1 = Monday
  const [lessons, classes, markedToday, exams, config, notices] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { staffId: scope.staffId, dayOfWeek: dow }, orderBy: { startTime: 'asc' }, include: { class: { select: { name: true } }, subject: { select: { name: true } } } }),
    prisma.class.findMany({ where: { schoolId, id: { in: scope.classIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } } }),
    prisma.attendance.groupBy({ by: ['classId'], where: { classId: { in: scope.classIds }, date: { gte: schoolTodayStart(), lt: schoolTodayEnd() } }, _count: { _all: true } }),
    prisma.exam.findMany({
      where: { classId: { in: scope.classIds }, date: { gte: new Date(now.getTime() - 45 * 86400000) } },
      include: { class: { select: { id: true, name: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } } }, subject: { select: { id: true, name: true } }, _count: { select: { results: true } } },
      orderBy: { date: 'desc' }, take: 40,
    }),
    loadHrConfig(schoolId),
    prisma.announcement.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, title: true, content: true, createdAt: true } }),
  ])
  const marked = new Set(markedToday.map((m) => m.classId))
  const myExams = exams.filter((e) => scope.classTeacherOf.includes(e.classId) || scope.assignments.some((a) => a.subjectId === e.subjectId && (a.classId === null || a.classId === e.classId)))
  const pendingMarks = myExams.filter((e) => e.status === 'DRAFT' && e._count.results < e.class._count.students)
  const balances = await leaveBalances(scope.staffId, now.getUTCFullYear(), config)
  const annual = balances.find((b) => b.key === 'ANNUAL')
  const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: SCHOOL_TIMEZONE })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Habari, {session.user.name?.split(' ')[0]}</h1>
        <p className="text-muted-foreground mt-1">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: SCHOOL_TIMEZONE })} · {lessons.length} lesson{lessons.length === 1 ? '' : 's'} today</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{classes.length}</p><p className="text-xs text-muted-foreground mt-1">My classes · {classes.reduce((s, c) => s + c._count.students, 0)} pupils</p></CardContent></Card>
        <Card className={classes.some((c) => !marked.has(c.id)) && scope.classTeacherOf.length ? 'border-amber-400/60' : ''}><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{scope.classTeacherOf.filter((id) => !marked.has(id)).length}</p><p className="text-xs text-muted-foreground mt-1">{t('teacher.registersToday')}</p></CardContent></Card>
        <Card className={pendingMarks.length ? 'border-amber-400/60' : ''}><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{pendingMarks.length}</p><p className="text-xs text-muted-foreground mt-1">{t('teacher.sheetsIncomplete')}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{annual ? (annual.remaining ?? annual.taken) : '—'}</p><p className="text-xs text-muted-foreground mt-1">{t('teacher.leaveDaysLeft')}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Today&apos;s lessons</CardTitle></CardHeader>
          <CardContent className="p-0">
            {lessons.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{t('teacher.noLessonsToday')}</p> : (
              <table className="w-full text-sm"><tbody>{lessons.map((l) => (
                <tr key={l.id} className="border-b"><td className="p-3 font-mono text-xs whitespace-nowrap">{l.startTime}–{l.endTime}</td><td className="p-3 font-medium">{l.subject?.name ?? 'Lesson'}</td><td className="p-3">{l.class.name}</td><td className="p-3 text-xs text-muted-foreground">{l.room ?? ''}</td></tr>
              ))}</tbody></table>
            )}
            <div className="p-3"><Button asChild variant="outline" size="sm"><Link href="/dashboard/timetable">{t('teacher.fullTimetable')}</Link></Button></div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarCheck className="w-4 h-4" /> My classes</CardTitle><CardDescription>{t('teacher.registerStatus')}</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {classes.length === 0 && <p className="text-sm text-muted-foreground">{t('teacher.noClasses')}</p>}
              {classes.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>{c.name} <span className="text-xs text-muted-foreground">· {c._count.students} pupils{scope.classTeacherOf.includes(c.id) ? ' · class teacher' : ''}</span></span>
                  <span className="flex items-center gap-1">{marked.has(c.id) ? <Badge variant="secondary">{t('teacher.marked')}</Badge> : <Button asChild size="sm" variant="outline" className="h-7"><Link href={`/dashboard/attendance?classId=${c.id}`}>{t('teacher.markRegister')}</Link></Button>}<Button asChild size="sm" variant="ghost" className="h-7 text-xs"><Link href={`/dashboard/seating?classId=${c.id}`}>{t('teacher.seating')}</Link></Button></span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ClipboardEdit className="w-4 h-4" /> Marks to enter</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {pendingMarks.length === 0 && <p className="text-sm text-muted-foreground">{t('teacher.allSheetsComplete')}</p>}
              {pendingMarks.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span>{e.name} <span className="text-xs text-muted-foreground">· {e.class.name} · {e.subject.name}</span></span>
                  <span className="text-xs font-mono">{e._count.results}/{e.class._count.students}</span>
                </div>
              ))}
              {pendingMarks.length > 0 && <Button asChild size="sm" variant="outline"><Link href="/dashboard/exams">{t('teacher.openSheets')}</Link></Button>}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Megaphone className="w-4 h-4" /> Notices</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notices.length === 0 && <p className="text-sm text-muted-foreground">{t('teacher.noNotices')}</p>}
            {notices.map((n) => <div key={n.id}><p className="text-sm font-medium">{n.title} <span className="text-xs text-muted-foreground">· {fmtDate(n.createdAt)}</span></p><p className="text-xs text-muted-foreground line-clamp-2">{n.content}</p></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Plane className="w-4 h-4" /> Leave</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {balances.filter((b) => b.entitlement > 0).slice(0, 4).map((b) => <div key={b.key} className="flex justify-between text-sm"><span>{b.name}</span><span className="font-mono">{b.taken} / {b.entitlement}{b.pending ? ` (+${b.pending} pending)` : ''}</span></div>)}
            <Button asChild size="sm" variant="outline" className="mt-2"><Link href="/dashboard/hr/me">{t('teacher.requestLeave')}</Link></Button>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> You see the classes and subjects on your teaching load. Something missing? Ask the office to update it.</p>
    </div>
  )
}
