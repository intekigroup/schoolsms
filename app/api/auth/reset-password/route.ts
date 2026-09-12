export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { resolveResetToken } from '@/lib/password-reset'

const Schema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

/** Checks a token without consuming it, so the form can show a useful state. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const userId = await resolveResetToken(token)
  return NextResponse.json({ valid: Boolean(userId) })
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'authIp')
  if (limited) return limited

  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { token, password } = parsed.data

  try {
    const userId = await resolveResetToken(token)
    if (!userId) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        // Bumping tokenVersion invalidates JWTs already issued on other devices.
        data: { hashedPassword, tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
      }),
      // Single use: burn every outstanding token for this user.
      prisma.verificationToken.deleteMany({ where: { identifier: `password-reset:${userId}` } }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('reset-password error:', e)
    return NextResponse.json({ error: 'Could not reset the password' }, { status: 500 })
  }
}
