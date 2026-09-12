import { NextResponse } from 'next/server'

/**
 * Per-instance sliding-window rate limiting.
 *
 * Login lockout and reset-token throttling already existed; every other endpoint
 * was unthrottled and open to scripted abuse. This is an in-process limiter, so
 * be honest about its bound: it protects a single instance. Behind several
 * instances or a serverless fleet, move the counter to Redis or the edge — the
 * call sites stay the same.
 */

interface Hit { count: number; resetAt: number }
const buckets = new Map<string, Hit>()

// Keeps the map from growing without bound on a long-lived server.
let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, hit] of buckets) if (hit.resetAt <= now) buckets.delete(key)
}

/**
 * Best-effort client identity.
 *
 * A proxy header is the only reliable source, and a deployment behind one gets
 * true per-IP limiting. Without it, falling back to a single constant would put
 * every user of the school in one bucket — one busy clerk would lock out
 * everyone — so we fall back to a coarse per-client fingerprint instead. It is
 * weaker than an IP and easily spoofed; set a trusted proxy header in
 * production.
 */
export function clientKey(req: Request): string {
  const h = req.headers
  const fwd = h.get('x-forwarded-for')
  if (fwd) return `ip:${fwd.split(',')[0].trim()}`
  const real = h.get('x-real-ip') ?? h.get('cf-connecting-ip')
  if (real) return `ip:${real}`

  const fingerprint = `${h.get('user-agent') ?? ''}|${h.get('accept-language') ?? ''}`
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) hash = (hash * 31 + fingerprint.charCodeAt(i)) | 0
  return `ua:${hash}`
}

export interface Limit {
  /** Requests allowed per window. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
}

export const LIMITS = {
  /**
   * Endpoints that send mail, keyed by the TARGET ACCOUNT rather than the
   * caller — the abuse here is bombing one person's inbox, and per-account is
   * the limit that actually stops it.
   */
  auth: { max: 10, windowMs: 60_000 },
  /**
   * Credential and token endpoints, keyed by client. Reset tokens carry 256
   * bits of entropy, so this is not what stops a brute force — it stops a
   * runaway script without getting in a real user's way.
   */
  authIp: { max: 60, windowMs: 60_000 },
  /** Signed-in writes. Generous enough for a busy office, low enough to stop a script. */
  write: { max: 60, windowMs: 60_000 },
  /** Whole-school CSV exports are expensive to produce. */
  export: { max: 10, windowMs: 60_000 },
  /** Per-class PDF reports are cheap (~30 ms) but still a document a script could farm. Per user. */
  report: { max: 60, windowMs: 60_000 },
} as const satisfies Record<string, Limit>

/**
 * Returns a 429 response when the caller is over the limit, or null to proceed.
 *
 *   const limited = rateLimit(req, 'auth')
 *   if (limited) return limited
 */
export function rateLimit(req: Request, bucket: keyof typeof LIMITS, identity?: string): NextResponse | null {
  const { max, windowMs } = LIMITS[bucket]
  const now = Date.now()
  sweep(now)

  const key = `${bucket}:${identity ?? clientKey(req)}`
  const hit = buckets.get(key)

  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  hit.count += 1
  if (hit.count <= max) return null

  const retryAfter = Math.ceil((hit.resetAt - now) / 1000)
  return NextResponse.json(
    { error: `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  )
}

/** Test seam — resets all counters. */
export function __resetRateLimits() {
  buckets.clear()
}
