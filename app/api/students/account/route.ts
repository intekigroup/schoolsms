export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Student login provisioning.
 *
 * The portal at /dashboard/my reads `Student.userId`, which previously could
 * only be set by editing the database. The office can now create a login for a
 * student, or remove one, from the students screen.
 *
 * Office-created accounts are marked verified: the school is vouching for the
 * pupil in person, and there is no inbox to confirm from. The temporary
 * password is returned ONCE, for the office to hand over.
 */

const CreateSchema = z.object({
  studentId: z.string().min(1),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255).optional(),
})

/** Readable but not guessable — handed over on paper, typed once. */
function tempPassword() {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, '') + randomBytes(2).toString('hex')
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { studentId } = parsed.data

  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, firstName: true, lastName: true, admissionNo: true, userId: true },
    })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (student.userId) {
      return NextResponse.json({ error: 'This student already has a login.' }, { status: 409 })
    }

    // Default to an address derived from the admission number: most pupils have
    // no email of their own, and this stays unique and recognisable.
    const email = parsed.data.email ?? `${student.admissionNo.toLowerCase()}@students.local`
    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (taken) {
      return NextResponse.json(
        { error: `${email} is already in use. Give this student a different address.` },
        { status: 409 }
      )
    }

    const password = tempPassword()
    const user = await prisma.user.create({
      data: {
        email,
        name: `${student.firstName} ${student.lastName}`,
        role: 'STUDENT',
        schoolId,
        // Vouched for in person by the office; there is no inbox to confirm from.
        emailVerified: new Date(),
        hashedPassword: await bcrypt.hash(password, 12),
        student: { connect: { id: student.id } },
      },
      select: { id: true, email: true },
    })

    await record(guard.session, {
      action: 'create',
      entity: 'StudentLogin',
      entityId: student.id,
      summary: `Created a student login (${email}) for ${student.firstName} ${student.lastName} (${student.admissionNo})`,
    })

    // The only time this password is ever readable.
    return NextResponse.json({ ok: true, email: user.email, password })
  } catch (e: any) {
    console.error('student account create failed:', e)
    return NextResponse.json({ error: 'Could not create the login' }, { status: 500 })
  }
}

/** Removes a student's login: unlinks it and disables sign-in. */
export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const studentId = new URL(req.url).searchParams.get('studentId')
  if (!studentId) return NextResponse.json({ error: 'Student id is required' }, { status: 400 })

  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, firstName: true, lastName: true, userId: true },
    })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (!student.userId) return NextResponse.json({ error: 'This student has no login.' }, { status: 409 })

    await prisma.$transaction([
      prisma.student.update({ where: { id: student.id }, data: { userId: null } }),
      // Deactivate rather than delete: notifications and audit history point at
      // this user. Bumping tokenVersion ends any session it currently holds.
      prisma.user.update({
        where: { id: student.userId },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      }),
    ])

    await record(guard.session, {
      action: 'delete',
      entity: 'StudentLogin',
      entityId: student.id,
      summary: `Removed the student login for ${student.firstName} ${student.lastName}`,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('student account removal failed:', e)
    return NextResponse.json({ error: 'Could not remove the login' }, { status: 500 })
  }
}
