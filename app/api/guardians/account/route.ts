export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Guardian (parent) login provisioning — the counterpart to
 * /api/students/account. The parent portal reads `Guardian.userId`, which could
 * previously only be set by editing the database, so the demo parent worked only
 * because the seed wired it up.
 *
 * Unlike students, guardians usually do have a real email address, so that is
 * used when present.
 */

const CreateSchema = z.object({
  guardianId: z.string().min(1),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255).optional(),
})

function tempPassword() {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, '') + randomBytes(2).toString('hex')
}

/** Guardians have no schoolId of their own — they belong to a school through their children. */
const inSchool = (schoolId: string) => ({ students: { some: { student: { schoolId } } } })

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { guardianId } = parsed.data

  try {
    const guardian = await prisma.guardian.findFirst({
      where: { id: guardianId, ...inSchool(schoolId) },
      select: { id: true, firstName: true, lastName: true, email: true, userId: true },
    })
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })
    if (guardian.userId) {
      return NextResponse.json({ error: 'This guardian already has a Shule SMS login (possibly issued by another school). The same login shows every child linked to them — no new account is needed.' }, { status: 409 })
    }

    const email = parsed.data.email ?? guardian.email?.trim().toLowerCase()
    if (!email) {
      return NextResponse.json(
        { error: 'This guardian has no email address on record. Add one, or supply an address for the login.' },
        { status: 400 }
      )
    }

    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (taken) {
      return NextResponse.json({ error: `${email} is already in use by another account.` }, { status: 409 })
    }

    const password = tempPassword()
    const user = await prisma.user.create({
      data: {
        email,
        name: `${guardian.firstName} ${guardian.lastName}`,
        role: 'PARENT',
        schoolId,
        // Issued in person by the office; there is no inbox round trip.
        emailVerified: new Date(),
        hashedPassword: await bcrypt.hash(password, 12),
        parent: { connect: { id: guardian.id } },
      },
      select: { id: true, email: true },
    })

    await record(guard.session, {
      action: 'create',
      entity: 'GuardianLogin',
      entityId: guardian.id,
      summary: `Created a parent login (${email}) for ${guardian.firstName} ${guardian.lastName}`,
    })

    return NextResponse.json({ ok: true, email: user.email, password })
  } catch (e: any) {
    console.error('guardian account create failed:', e)
    return NextResponse.json({ error: 'Could not create the login' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const guardianId = new URL(req.url).searchParams.get('guardianId')
  if (!guardianId) return NextResponse.json({ error: 'Guardian id is required' }, { status: 400 })

  try {
    const guardian = await prisma.guardian.findFirst({
      where: { id: guardianId, ...inSchool(schoolId) },
      select: { id: true, firstName: true, lastName: true, userId: true },
    })
    if (!guardian) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })
    if (!guardian.userId) return NextResponse.json({ error: 'This guardian has no login.' }, { status: 409 })

    await prisma.$transaction([
      prisma.guardian.update({ where: { id: guardian.id }, data: { userId: null } }),
      prisma.user.update({
        where: { id: guardian.userId },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      }),
    ])

    await record(guard.session, {
      action: 'delete',
      entity: 'GuardianLogin',
      entityId: guardian.id,
      summary: `Removed the parent login for ${guardian.firstName} ${guardian.lastName}`,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('guardian account removal failed:', e)
    return NextResponse.json({ error: 'Could not remove the login' }, { status: 500 })
  }
}
