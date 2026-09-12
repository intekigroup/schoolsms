import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The QR code on a card opens /verify/<kind>/<id>.<sig>. The signature is an
 * HMAC over the kind and record id, so a card cannot be forged for a record
 * the school never issued a card for, and nothing has to be stored per card.
 * The page then shows the holder's current status, so a card for a pupil who
 * left, or a card that was cancelled, reads as invalid the moment the record
 * changes.
 */
export type CardKind = 'student' | 'staff'

function secret() {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET is not set')
  return s
}

export function signCard(kind: CardKind, id: string): string {
  const sig = createHmac('sha256', secret()).update(`idcard:${kind}:${id}`).digest('base64url').slice(0, 22)
  return `${id}.${sig}`
}

export function verifyCardToken(kind: string, token: string): { ok: true; kind: CardKind; id: string } | { ok: false } {
  if (kind !== 'student' && kind !== 'staff') return { ok: false }
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return { ok: false }
  const id = token.slice(0, dot), sig = token.slice(dot + 1)
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return { ok: false }
  const expected = signCard(kind, id).slice(id.length + 1)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false }
  return { ok: true, kind, id }
}

export function verifyUrl(origin: string, kind: CardKind, id: string) {
  return `${origin}/verify/${kind}/${signCard(kind, id)}`
}
