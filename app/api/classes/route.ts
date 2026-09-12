export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

export async function GET() {
  const guard = await requireApiRole(ROLES.classesRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  if (!schoolId) return NextResponse.json([])
  const classes = await prisma.class.findMany({
    where: { schoolId },
    include: { _count: { select: { students: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(classes)
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.classesWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const cls = await prisma.class.create({
      data: {
        name: body.name,
        level: body.level ?? 'PRIMARY',
        stream: body.stream ?? null,
        capacity: body.capacity ?? 40,
        schoolId,
      },
    })
    return NextResponse.json(cls)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.classesWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Class id is required' }, { status: 400 })
    const existing = await prisma.class.findFirst({ where: { id, schoolId } })
    if (!existing) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    // Leadership: class teacher (staff), monitor (a boy in the class), monitress (a girl in the class).
    const leaders: { classTeacherId?: string | null; monitorId?: string | null; monitressId?: string | null } = {}
    if (body.classTeacherId !== undefined) {
      if (body.classTeacherId) {
        const st = await prisma.staff.findFirst({ where: { id: body.classTeacherId, schoolId }, select: { id: true } })
        if (!st) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
        // One class per class teacher.
        await prisma.class.updateMany({ where: { schoolId, classTeacherId: body.classTeacherId, id: { not: id } }, data: { classTeacherId: null } })
      }
      leaders.classTeacherId = body.classTeacherId || null
    }
    for (const [key, gender] of [['monitorId', 'MALE'], ['monitressId', 'FEMALE']] as const) {
      if (body[key] === undefined) continue
      if (body[key]) {
        const pupil = await prisma.student.findFirst({ where: { id: body[key], schoolId, classId: id, status: 'ACTIVE' }, select: { gender: true, firstName: true } })
        if (!pupil) return NextResponse.json({ error: 'The pupil must be an active member of this class' }, { status: 400 })
        if (pupil.gender !== gender) return NextResponse.json({ error: `${key === 'monitorId' ? 'The monitor is a boy' : 'The monitress is a girl'} in the class` }, { status: 400 })
      }
      leaders[key] = body[key] || null
    }
    const cls = await prisma.class.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        level: body.level ?? existing.level,
        stream: body.stream === undefined ? existing.stream : (body.stream || null),
        capacity: body.capacity === undefined ? existing.capacity : body.capacity,
        ...leaders,
      },
    })
    return NextResponse.json(cls)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.classesWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Class id is required' }, { status: 400 })
  const existing = await prisma.class.findFirst({ where: { id, schoolId }, include: { _count: { select: { students: true } } } })
  if (!existing) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (existing._count.students > 0) {
    return NextResponse.json({ error: `This class has ${existing._count.students} student(s). Reassign or remove them before deleting the class.` }, { status: 409 })
  }
  try {
    await prisma.class.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json({ error: 'This class has linked records and cannot be deleted.' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
