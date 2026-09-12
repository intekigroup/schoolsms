export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

// Create a transport route or a vehicle depending on body.type
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.transport, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (body.type === 'vehicle') {
      if (!body.plateNumber) return NextResponse.json({ error: 'Plate number is required' }, { status: 400 })
      const vehicle = await prisma.vehicle.create({
        data: {
          plateNumber: body.plateNumber,
          capacity: body.capacity ? Number(body.capacity) : 40,
          driverName: body.driverName ?? null,
          driverPhone: body.driverPhone ?? null,
          schoolId,
        },
      })
      return NextResponse.json(vehicle)
    }
    // default: route
    if (!body.name) return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
    const route = await prisma.transportRoute.create({
      data: {
        name: body.name,
        stops: body.stops ?? null,
        fee: body.fee ? Number(body.fee) : 0,
        schoolId,
      },
    })
    return NextResponse.json(route)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
