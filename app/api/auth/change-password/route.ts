export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireApiUser } from '@/lib/authz'
import { clearResetTokens } from '@/lib/password-reset'

const Schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
})

/** Changes the signed-in user's own password. Requires the current one. */
export async function POST(req: Request) {
  const guard = await requireApiUser()
  if (!guard.ok) return guard.response
  const { userId } = guard

  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { currentPassword, newPassword } = parsed.data

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hashedPassword: true },
    })
    if (!user?.hashedPassword) {
      return NextResponse.json({ error: 'This account has no password set' }, { status: 400 })
    }
    if (!(await bcrypt.compare(currentPassword, user.hashedPassword))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
    }
    if (await bcrypt.compare(newPassword, user.hashedPassword)) {
      return NextResponse.json({ error: 'New password must differ from the current one' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: userId },
      // Bumping tokenVersion signs out other devices.
      data: { hashedPassword: await bcrypt.hash(newPassword, 12), tokenVersion: { increment: 1 } },
    })
    // A pending reset link should not survive a deliberate password change.
    await clearResetTokens(userId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('change-password error:', e)
    return NextResponse.json({ error: 'Could not change the password' }, { status: 500 })
  }
}
