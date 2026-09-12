export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

// Create a dormitory or a room depending on body.type
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.hostel, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (body.type === 'room') {
      if (!body.dormitoryId || !body.roomNumber) {
        return NextResponse.json({ error: 'Dormitory and room number are required' }, { status: 400 })
      }
      // Verify dormitory belongs to this school (tenant isolation)
      const dorm = await prisma.dormitory.findFirst({ where: { id: body.dormitoryId, schoolId } })
      if (!dorm) return NextResponse.json({ error: 'Dormitory not found' }, { status: 404 })
      const room = await prisma.room.create({
        data: {
          roomNumber: body.roomNumber,
          capacity: body.capacity ? Number(body.capacity) : 4,
          dormitoryId: body.dormitoryId,
        },
      })
      return NextResponse.json(room)
    }
    // default: dormitory
    if (!body.name) return NextResponse.json({ error: 'Dormitory name is required' }, { status: 400 })
    const dorm = await prisma.dormitory.create({
      data: {
        name: body.name,
        gender: body.gender ?? 'MALE',
        capacity: body.capacity ? Number(body.capacity) : 50,
        schoolId,
      },
    })
    return NextResponse.json(dorm)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
