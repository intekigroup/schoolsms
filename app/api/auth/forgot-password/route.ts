export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { createResetToken, RESET_TTL_MINUTES } from '@/lib/password-reset'
import { sendMail, mailTransport } from '@/lib/mailer'

const Schema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
})

/**
 * Starts a password reset. Always answers 200 with the same body regardless of
 * whether the address exists, so this cannot be used to enumerate accounts.
 */
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
      select: { id: true, name: true, isActive: true },
    })

    // Silent no-op for unknown or deactivated accounts — same response either way.
    if (user?.isActive) {
      const token = await createResetToken(user.id)
      if (token) {
        const origin = new URL(req.url).origin
        const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`
        await sendMail({
          to: email,
          subject: 'Reset your Shule SMS password',
          text: [
            `Hello ${user.name ?? ''}`.trim(),
            '',
            'Use the link below to choose a new password. It expires in ' +
              `${RESET_TTL_MINUTES} minutes and can only be used once.`,
            '',
            link,
            '',
            'If you did not request this, you can ignore this email — your password will not change.',
          ].join('\n'),
        })
      }
      // token === null means the throttle tripped; still answer identically.
    }
  } catch (e) {
    // Never leak failure details to an anonymous caller.
    console.error('forgot-password error:', e)
  }

  return NextResponse.json({
    ok: true,
    message: 'If that email is registered, a reset link has been sent.',
    // Lets the UI warn honestly that nothing was actually emailed.
    emailConfigured: mailTransport() === 'smtp',
  })
}
