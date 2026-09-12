export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Attaches a guardian to another pupil, or detaches them.
 *
 * Siblings share guardians, so a parent enrolled with one child must be
 * connectable to the next without re-entering their details.
 */

const inSchool = (schoolId: string) => ({ students: { some: { student: { schoolId } } } })

const LinkSchema = z.object({
  guardianId: z.string().min(1),
  studentId: z.string().min(1),
  isPrimary: z.boolean().optional(),
})

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const parsed = LinkSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a guardian and a pupil' }, { status: 400 })
  }
  const { guardianId, studentId, isPrimary } = parsed.data

  try {
    const [guardian, student] = await Promise.all([
      prisma.guardian.findFirst({ where: { id: guardianId, ...inSchool(schoolId) }, select: { id: true, firstName: true, lastName: true } }),
      prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, firstName: true, lastName: true } }),
    ])
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const already = await prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
      select: { id: true },
    })
    if (already) {
      return NextResponse.json({ error: 'This guardian is already linked to that pupil.' }, { status: 409 })
    }

    await prisma.studentGuardian.create({
      data: { studentId, guardianId, isPrimary: isPrimary ?? false },
    })

    await record(guard.session, {
      action: 'update',
      entity: 'Guardian',
      entityId: guardian.id,
      summary: `Linked guardian ${guardian.firstName} ${guardian.lastName} to ${student.firstName} ${student.lastName}`,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('guardian link failed:', e)
    return NextResponse.json({ error: 'Could not link the guardian' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const url = new URL(req.url)
  const guardianId = url.searchParams.get('guardianId')
  const studentId = url.searchParams.get('studentId')
  if (!guardianId || !studentId) {
    return NextResponse.json({ error: 'Guardian and student are both required' }, { status: 400 })
  }

  try {
    const guardian = await prisma.guardian.findFirst({
      where: { id: guardianId, ...inSchool(schoolId) },
      select: { id: true, firstName: true, lastName: true, _count: { select: { students: true } } },
    })
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })

    // Detaching the last child would strand the guardian outside every school,
    // where nothing could reach or delete them again.
    if (guardian._count.students <= 1) {
      return NextResponse.json(
        { error: 'This is the guardian\'s only pupil. Link them to another child first, or delete the guardian.' },
        { status: 409 }
      )
    }

    const link = await prisma.studentGuardian.findFirst({
      where: { studentId, guardianId, student: { schoolId } },
      select: { id: true, student: { select: { firstName: true, lastName: true } } },
    })
    if (!link) return NextResponse.json({ error: 'That guardian is not linked to this pupil.' }, { status: 404 })

    await prisma.studentGuardian.delete({ where: { id: link.id } })

    await record(guard.session, {
      action: 'update',
      entity: 'Guardian',
      entityId: guardian.id,
      summary: `Unlinked guardian ${guardian.firstName} ${guardian.lastName} from ${link.student.firstName} ${link.student.lastName}`,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('guardian unlink failed:', e)
    return NextResponse.json({ error: 'Could not unlink the guardian' }, { status: 500 })
  }
}
