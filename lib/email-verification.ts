import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

/**
 * Email-confirmation tokens. Same storage and hashing approach as
 * lib/password-reset.ts, under a separate identifier namespace.
 */

const TTL_HOURS = 24
const PREFIX = 'email-verify:'

const identifierFor = (userId: string) => `${PREFIX}${userId}`
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export const VERIFY_TTL_HOURS = TTL_HOURS

export async function createVerificationToken(userId: string): Promise<string> {
  const identifier = identifierFor(userId)
  // One outstanding link per user: issuing a new one retires the old.
  await prisma.verificationToken.deleteMany({ where: { identifier } })

  const token = randomBytes(32).toString('base64url')
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hash(token),
      expires: new Date(Date.now() + TTL_HOURS * 3_600_000),
    },
  })
  return token
}

/** Consumes a token and marks the user verified. Returns false if unusable. */
export async function consumeVerificationToken(token: string): Promise<boolean> {
  if (!token) return false
  const row = await prisma.verificationToken.findUnique({ where: { token: hash(token) } })
  if (!row || !row.identifier.startsWith(PREFIX)) return false
  if (row.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token: row.token } })
    return false
  }

  const userId = row.identifier.slice(PREFIX.length)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.deleteMany({ where: { identifier: row.identifier } }),
  ])
  return true
}
