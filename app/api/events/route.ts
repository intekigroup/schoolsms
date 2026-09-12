export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.events, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const event = await prisma.event.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : null,
        location: body.location ?? null,
        schoolId,
      },
    })
    return NextResponse.json(event)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.events, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const ev = await prisma.event.findFirst({ where: { id, schoolId } })
    if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.event.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
