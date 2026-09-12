import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/mailer'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'

/**
 * Unhandled server errors land in the ErrorLog table and, at most once per
 * fingerprint per 15 minutes, in the platform inbox — so results-day failures
 * are seen within minutes, without a third-party service.
 */
const lastMail = new Map<string, number>()
const MAIL_EVERY_MS = 15 * 60_000

export async function recordError(err: unknown, ctx: { path?: string; method?: string; kind?: string; userId?: string | null; schoolId?: string | null } = {}) {
  const e = err as any
  const message = String(e?.message ?? err).slice(0, 500)
  const stack = typeof e?.stack === 'string' ? e.stack.slice(0, 4000) : null
  const digest = typeof e?.digest === 'string' ? e.digest : null
  const fingerprint = createHash('sha1').update(`${ctx.path ?? ''}|${message.replace(/[0-9a-f]{8,}/gi, '#')}`).digest('hex').slice(0, 16)
  try {
    await prisma.errorLog.create({ data: { fingerprint, message, stack, digest, path: ctx.path ?? null, method: ctx.method ?? null, kind: ctx.kind ?? null, userId: ctx.userId ?? null, schoolId: ctx.schoolId ?? null } })
  } catch (dbErr) { console.error('error log write failed', dbErr) }
  const now = Date.now()
  if (process.env.NODE_ENV === 'production' && now - (lastMail.get(fingerprint) ?? 0) > MAIL_EVERY_MS) {
    lastMail.set(fingerprint, now)
    sendMail({ to: CONTACT_EMAIL, subject: `[Shule SMS] server error on ${ctx.path ?? 'unknown path'}`, text: `${ctx.method ?? ''} ${ctx.path ?? ''}\n\n${message}\n\n${stack ?? ''}\n\nRecent errors: ${SITE_URL}/dashboard/super-admin` }).catch(() => {})
  }
}
