export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { attachment, safe } from '@/lib/pdf'
import { teachingScope, canSeeClass, viewerClasses, isViewerRole } from '@/lib/teaching'

/** Printable week timetable for a class (?classId) or a teacher (?staffId), A4 landscape. */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.timetableRead)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId'), staffId = searchParams.get('staffId')
  if (!classId && !staffId) return NextResponse.json({ error: 'classId or staffId is required' }, { status: 400 })
  let schoolId = guard.schoolId
  if (isViewerRole(guard.role)) {
    // A pupil or a guardian prints their own class; the letterhead is that class's school.
    const mine = await viewerClasses(guard.session)
    const cls = classId ? mine.find((c) => c.id === classId) : null
    if (!cls || staffId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    schoolId = cls.schoolId
  } else {
    const scope = await teachingScope(guard.session)
    if (classId && !canSeeClass(scope, classId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (staffId && !scope.all && staffId !== scope.staffId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const limited = rateLimit(req, 'report', guard.session.user.id)
  if (limited) return limited

  const [school, cls, staff, slots] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    classId ? prisma.class.findFirst({ where: { id: classId, schoolId }, select: { name: true } }) : null,
    staffId ? prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { firstName: true, lastName: true } }) : null,
    prisma.timetableSlot.findMany({ where: { class: { schoolId }, ...(classId ? { classId } : {}), ...(staffId ? { staffId } : {}) }, include: { class: { select: { name: true } }, subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } } }),
  ])
  if (classId && !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (staffId && !staff) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  const title = cls ? `Timetable · ${cls.name}` : `Timetable · ${staff!.firstName} ${staff!.lastName}`

  const times = [...new Set(slots.map((s) => s.startTime))].sort()
  const days = [1, 2, 3, 4, 5, ...(slots.some((s) => s.dayOfWeek === 6) ? [6] : []), ...(slots.some((s) => s.dayOfWeek === 7) ? [7] : [])]
  const pdf = await PDFDocument.create(); pdf.setTitle(title)
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 841.89, H = 595.28, M = 36
  const page = pdf.addPage([W, H])
  const INK = rgb(0.08, 0.1, 0.13), SOFT = rgb(0.42, 0.47, 0.53), ACCENT = rgb(0.04, 0.44, 0.58), RULE = rgb(0.83, 0.87, 0.9), FILL = rgb(0.95, 0.97, 0.98)
  page.drawText(safe(school!.name.toUpperCase()), { x: M, y: H - M - 4, size: 13, font: bold, color: INK })
  page.drawText(safe(title.toUpperCase()), { x: M, y: H - M - 22, size: 9, font: bold, color: ACCENT })
  const timeW = 56, gridW = W - 2 * M - timeW, colW = gridW / days.length
  const top = H - M - 44, rowH = Math.min(58, (top - M - 20) / Math.max(times.length, 1))
  page.drawLine({ start: { x: M, y: top }, end: { x: W - M, y: top }, thickness: 0.75, color: RULE })
  days.forEach((d, i) => page.drawText(DAYS[d - 1], { x: M + timeW + i * colW + 4, y: top + 6, size: 8, font: bold, color: SOFT }))
  times.forEach((t, r) => {
    const y = top - (r + 1) * rowH
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: RULE })
    const end = slots.find((s) => s.startTime === t)?.endTime
    page.drawText(`${t}${end ? `–${end}` : ''}`, { x: M, y: y + rowH / 2 - 3, size: 7, font: regular, color: SOFT })
    days.forEach((d, i) => {
      const s = slots.find((x) => x.dayOfWeek === d && x.startTime === t)
      if (!s) return
      const x = M + timeW + i * colW
      page.drawRectangle({ x: x + 2, y: y + 2, width: colW - 4, height: rowH - 4, color: FILL, borderColor: RULE, borderWidth: 0.5 })
      page.drawText(safe(s.subject?.name ?? 'Lesson').slice(0, 22), { x: x + 6, y: y + rowH - 16, size: 8.5, font: bold, color: INK })
      const second = cls ? (s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '') : s.class.name
      if (second) page.drawText(safe(second).slice(0, 26), { x: x + 6, y: y + rowH - 28, size: 7, font: regular, color: SOFT })
      if (s.room) page.drawText(safe(`Room ${s.room}`), { x: x + 6, y: y + 6, size: 6.5, font: regular, color: SOFT })
    })
  })
  page.drawText(safe(`${school!.name} · Printed ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`), { x: M, y: 20, size: 7, font: regular, color: SOFT })
  const bytes = await pdf.save()
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(`${title}.pdf`), 'Cache-Control': 'no-store' } })
}
