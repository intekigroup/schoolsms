export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { teachingScope, canSeeClass } from '@/lib/teaching'

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.attendance, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const { entries } = await req.json()
    if (!entries?.length) return NextResponse.json({ error: 'No entries' }, { status: 400 })

    // Tenant isolation: only accept entries for students in the caller's school.
    const studentIds: string[] = [...new Set(entries.map((e: any) => e.studentId))] as string[]
    const owned = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, classId: true },
    })
    if (owned.length !== studentIds.length) {
      return NextResponse.json({ error: 'One or more students do not belong to this school' }, { status: 403 })
    }
    const scope = await teachingScope(guard.session)
    if (owned.some((s) => !canSeeClass(scope, s.classId))) return NextResponse.json({ error: 'One or more pupils are not in a class on your teaching load' }, { status: 403 })
    // Attendance.classId is required, but a student may not be in a class yet.
    const unassigned = owned.filter((s) => !s.classId)
    if (unassigned.length) {
      return NextResponse.json(
        { error: 'One or more students are not assigned to a class' },
        { status: 400 }
      )
    }
    const classById = new Map(owned.map((s) => [s.id, s.classId as string]))

    await prisma.$transaction(
      entries.map((entry: any) =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: entry.studentId, date: new Date(entry.date) } },
          update: { status: entry.status },
          create: {
            studentId: entry.studentId,
            // Trust the student's own class, not a client-supplied id.
            classId: classById.get(entry.studentId) as string,
            date: new Date(entry.date),
            status: entry.status,
          },
        })
      )
    )
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

// GET attendance for a class on a given date
export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.attendance)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')
  const date = searchParams.get('date')
  if (!classId || !date) return NextResponse.json({ error: 'classId and date required' }, { status: 400 })
  try {
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } })
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!canSeeClass(await teachingScope(guard.session), classId)) return NextResponse.json({ error: 'This class is not on your teaching load' }, { status: 403 })
    const records = await prisma.attendance.findMany({
      where: { classId, date: new Date(date) },
      select: { studentId: true, status: true },
    })
    const map: Record<string, string> = {}
    for (const r of records) map[r.studentId] = r.status
    return NextResponse.json({ attendance: map })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
