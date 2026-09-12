import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.hostel, req)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

    const { studentId, roomId } = await req.json()
    if (!studentId || !roomId) return NextResponse.json({ error: 'Student and room are required' }, { status: 400 })

    // Tenant isolation
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const room = await prisma.room.findFirst({
      where: { id: roomId, dormitory: { schoolId } },
      include: { _count: { select: { assignments: true } } },
    })
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    // Capacity check (exclude this student if already in this room)
    const alreadyHere = await prisma.roomAssignment.findFirst({ where: { studentId, roomId } })
    if (!alreadyHere && (room._count?.assignments ?? 0) >= room.capacity) {
      return NextResponse.json({ error: 'Room is full' }, { status: 400 })
    }

    // RoomAssignment is unique on studentId -> upsert to move student
    const assignment = await prisma.roomAssignment.upsert({
      where: { studentId },
      create: { studentId, roomId },
      update: { roomId },
    })
    return NextResponse.json({ success: true, assignment })
  } catch (e: any) {
    console.error('Hostel assign error:', e)
    return NextResponse.json({ error: 'Failed to assign student' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.hostel, req)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

    const { searchParams } = new URL(req.url)
    const studentId = searchParams.get('studentId')
    if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    await prisma.roomAssignment.deleteMany({ where: { studentId } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Hostel unassign error:', e)
    return NextResponse.json({ error: 'Failed to remove student' }, { status: 500 })
  }
}
