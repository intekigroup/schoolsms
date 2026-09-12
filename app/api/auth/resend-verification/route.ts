export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { createVerificationToken, VERIFY_TTL_HOURS } from '@/lib/email-verification'
import { sendMail, mailTransport } from '@/lib/mailer'

const Schema = z.object({ email: z.string().trim().toLowerCase().email().max(255) })

/** Re-sends a confirmation link. Same non-enumerating shape as forgot-password. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }
  const { email } = parsed.data

  // Keyed by the address being mailed: the abuse is bombing one inbox.
  const limited = rateLimit(req, 'auth', email)
  if (limited) return limited

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, isActive: true, emailVerified: true },
    })
    if (user?.isActive && !user.emailVerified) {
      const token = await createVerificationToken(user.id)
      const origin = new URL(req.url).origin
      await sendMail({
        to: email,
        subject: 'Confirm your Shule SMS account',
        text: [
          `Hello ${user.name}`,
          '',
          `Confirm your email address to activate your account. This link expires in ${VERIFY_TTL_HOURS} hours.`,
          '',
          `${origin}/verify-email?token=${encodeURIComponent(token)}`,
        ].join('\n'),
      })
    }
  } catch (e) {
    console.error('resend-verification error:', e)
  }

  return NextResponse.json({
    ok: true,
    message: 'If that account exists and is unconfirmed, a new link has been sent.',
    emailConfigured: mailTransport() === 'smtp',
  })
}
