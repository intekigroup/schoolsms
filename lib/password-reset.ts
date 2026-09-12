import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'

/**
 * Password-reset tokens, stored in the (previously unused) `VerificationToken`
 * table under a namespaced identifier so they can't collide with NextAuth's own
 * email-verification tokens if an email provider is added later.
 *
 * Only a SHA-256 hash of the token is stored — the raw value exists solely in
 * the link sent to the user, so a database leak cannot be replayed.
 */

const TTL_MINUTES = 60
const MAX_ACTIVE_TOKENS = 3
const PREFIX = 'password-reset:'

const identifierFor = (userId: string) => `${PREFIX}${userId}`
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export const RESET_TTL_MINUTES = TTL_MINUTES

/**
 * Issues a reset token for a user, or returns null when they already have
 * MAX_ACTIVE_TOKENS unexpired ones (a cheap, instance-independent throttle
 * against someone hammering the forgot-password endpoint).
 */
export async function createResetToken(userId: string): Promise<string | null> {
  const identifier = identifierFor(userId)

  // Opportunistic cleanup keeps the throttle count honest.
  await prisma.verificationToken.deleteMany({
    where: { identifier, expires: { lt: new Date() } },
  })

  const active = await prisma.verificationToken.count({ where: { identifier } })
  if (active >= MAX_ACTIVE_TOKENS) return null

  const token = randomBytes(32).toString('base64url')
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hash(token),
      expires: new Date(Date.now() + TTL_MINUTES * 60_000),
    },
  })
  return token
}

/** Resolves a raw token to its user id, or null if unknown/expired. */
export async function resolveResetToken(token: string): Promise<string | null> {
  if (!token) return null
  const row = await prisma.verificationToken.findUnique({ where: { token: hash(token) } })
  if (!row || !row.identifier.startsWith(PREFIX)) return null
  if (row.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token: row.token } })
    return null
  }
  // Constant-time compare of the stored hash against a freshly computed one;
  // the lookup above already matched, this guards against future refactors
  // that might introduce a non-unique lookup.
  const a = Buffer.from(row.token)
  const b = Buffer.from(hash(token))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return row.identifier.slice(PREFIX.length)
}

/** Invalidates every outstanding reset token for a user (called after a reset). */
export async function clearResetTokens(userId: string) {
  await prisma.verificationToken.deleteMany({ where: { identifier: identifierFor(userId) } })
}
