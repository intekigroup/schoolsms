import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.transport, req)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

    const { studentId, routeId } = await req.json()
    if (!studentId || !routeId) return NextResponse.json({ error: 'Student and route are required' }, { status: 400 })

    // Tenant isolation
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const route = await prisma.transportRoute.findFirst({ where: { id: routeId, schoolId } })
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 })

    // StudentRoute is unique on studentId -> upsert to reassign
    const assignment = await prisma.studentRoute.upsert({
      where: { studentId },
      create: { studentId, routeId },
      update: { routeId },
    })
    return NextResponse.json({ success: true, assignment })
  } catch (e: any) {
    console.error('Transport assign error:', e)
    return NextResponse.json({ error: 'Failed to assign student' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.transport, req)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

    const { searchParams } = new URL(req.url)
    const studentId = searchParams.get('studentId')
    if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })

    // Tenant isolation via student
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    await prisma.studentRoute.deleteMany({ where: { studentId } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Transport unassign error:', e)
    return NextResponse.json({ error: 'Failed to remove student' }, { status: 500 })
  }
}
