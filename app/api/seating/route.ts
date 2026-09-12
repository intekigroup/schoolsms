export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { attachment, safe } from '@/lib/pdf'
import { teachingScope, canSeeClass } from '@/lib/teaching'

/**
 * Seating plan for a class.
 *   GET ?classId              plan (rows, cols, seats) plus the class roll
 *   GET ?classId&format=pdf   printable chart, teacher's view (front of the room at the top)
 *   PUT { classId, rows, cols, seats: [{ studentId, row, col }] }
 * Admins and the class teacher edit; any teacher of the class may view.
 */
const Seat = z.object({ studentId: z.string().min(1), row: z.number().int().min(0).max(19), col: z.number().int().min(0).max(19) })
const Body = z.object({ classId: z.string().min(1), rows: z.number().int().min(1).max(20), cols: z.number().int().min(1).max(20), seats: z.array(Seat).max(400) })

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.classesRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId') ?? ''
  const scope = await teachingScope(guard.session)
  if (!canSeeClass(scope, classId)) return NextResponse.json({ error: 'This class is not on your teaching load' }, { status: 403 })
  const cls = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, classTeacher: { select: { firstName: true, lastName: true } }, seatPlan: true, students: { where: { status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, gender: true, admissionNo: true, photoUrl: true } } },
  })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  const roll = cls.students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, gender: s.gender, admissionNo: s.admissionNo, photoUrl: s.photoUrl }))
  const ids = new Set(roll.map((s) => s.id))
  const seats = ((cls.seatPlan?.seats as any[]) ?? []).filter((x) => ids.has(x.studentId))
  const plan = { rows: cls.seatPlan?.rows ?? 5, cols: cls.seatPlan?.cols ?? 6, seats, updatedAt: cls.seatPlan?.updatedAt ?? null }
  const canEdit = scope.all || scope.classTeacherOf.includes(classId)

  if (searchParams.get('format') !== 'pdf') return NextResponse.json({ class: { id: cls.id, name: cls.name, classTeacher: cls.classTeacher ? `${cls.classTeacher.firstName} ${cls.classTeacher.lastName}` : null }, plan, roll, canEdit })

  const limited = rateLimit(req, 'report', guard.session.user.id)
  if (limited) return limited
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } })
  const pdf = await PDFDocument.create(); pdf.setTitle(`Seating plan · ${cls.name}`)
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 841.89, H = 595.28, M = 36
  const page = pdf.addPage([W, H])
  const INK = rgb(0.08, 0.1, 0.13), SOFT = rgb(0.42, 0.47, 0.53), ACCENT = rgb(0.04, 0.44, 0.58), RULE = rgb(0.83, 0.87, 0.9)
  page.drawText(safe(school!.name.toUpperCase()), { x: M, y: H - M - 4, size: 13, font: bold, color: INK })
  page.drawText(safe(`SEATING PLAN · ${cls.name}${cls.classTeacher ? ` · Class teacher ${cls.classTeacher.firstName} ${cls.classTeacher.lastName}` : ''}`), { x: M, y: H - M - 22, size: 9, font: bold, color: ACCENT })
  // Front of the room: a bar across the top.
  const top = H - M - 40
  page.drawRectangle({ x: M, y: top - 14, width: W - 2 * M, height: 14, color: rgb(0.9, 0.93, 0.95) })
  const fl = 'FRONT · TEACHER’S DESK / BOARD'
  page.drawText(safe(fl), { x: (W - bold.widthOfTextAtSize(safe(fl), 7)) / 2, y: top - 10, size: 7, font: bold, color: SOFT })
  const gridTop = top - 26, gridH = gridTop - M - 16, gridW = W - 2 * M
  const cw = gridW / plan.cols, ch = gridH / plan.rows
  const byPos = new Map(seats.map((s) => [`${s.row}:${s.col}`, roll.find((r) => r.id === s.studentId)!]))
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
    const x = M + c * cw + 3, y = gridTop - (r + 1) * ch + 3
    const pupil = byPos.get(`${r}:${c}`)
    page.drawRectangle({ x, y, width: cw - 6, height: ch - 6, borderColor: RULE, borderWidth: 0.6, color: pupil ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1) })
    if (pupil) {
      const size = cw > 90 ? 8.5 : 7
      const name = safe(pupil.name)
      page.drawText(name.length > 22 ? `${name.slice(0, 21)}…` : name, { x: x + 5, y: y + ch / 2 - 2, size, font: bold, color: INK })
      page.drawText(safe(pupil.admissionNo), { x: x + 5, y: y + ch / 2 - 13, size: 6.5, font: regular, color: SOFT })
    }
  }
  const unseated = roll.filter((s) => !seats.some((x) => x.studentId === s.id))
  page.drawText(safe(`${seats.length} seated · ${unseated.length} unseated${unseated.length ? `: ${unseated.map((s) => s.name).join(', ').slice(0, 140)}` : ''}`), { x: M, y: M - 4, size: 7, font: regular, color: SOFT })
  page.drawText(safe(`Printed ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`), { x: W - M - 90, y: M - 4, size: 7, font: regular, color: SOFT })
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(`seating-plan-${cls.name}.pdf`), 'Cache-Control': 'no-store' } })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.classesRead, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  const { classId, rows, cols, seats } = parsed.data
  const scope = await teachingScope(guard.session)
  if (!(scope.all || scope.classTeacherOf.includes(classId))) return NextResponse.json({ error: 'Only the class teacher or the office can change the seating plan' }, { status: 403 })
  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true, students: { where: { status: 'ACTIVE' }, select: { id: true } } } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  const roll = new Set(cls.students.map((s) => s.id))
  const taken = new Set<string>(), placed = new Set<string>()
  for (const s of seats) {
    if (!roll.has(s.studentId)) return NextResponse.json({ error: 'A seated pupil is not in this class' }, { status: 400 })
    if (s.row >= rows || s.col >= cols) return NextResponse.json({ error: 'A seat is outside the grid' }, { status: 400 })
    const key = `${s.row}:${s.col}`
    if (taken.has(key)) return NextResponse.json({ error: 'Two pupils on one seat' }, { status: 400 })
    if (placed.has(s.studentId)) return NextResponse.json({ error: 'A pupil is seated twice' }, { status: 400 })
    taken.add(key); placed.add(s.studentId)
  }
  const plan = await prisma.seatPlan.upsert({ where: { classId }, update: { rows, cols, seats: seats as any }, create: { classId, rows, cols, seats: seats as any } })
  await record(guard.session, { action: 'update', entity: 'SeatPlan', entityId: classId, summary: `Saved the seating plan for ${cls.name} (${seats.length} of ${roll.size} seated, ${rows}×${cols})` })
  return NextResponse.json({ success: true, plan })
}
