import type { SmsProvider, SmsMessage, SmsSendResult } from './types'
import { normaliseTzPhone } from './types'

/**
 * NextSMS (nextsms.co.tz) — Tanzanian bulk SMS.
 *
 * Their published API reference is a JavaScript-rendered Postman page, so the
 * request shape below follows NextSMS's documented Infobip-style contract
 * rather than a page we could machine-read. Everything that could differ is
 * therefore configurable, so a mismatch is a .env change and not a code change:
 *
 *   NEXTSMS_BASE_URL   default https://messaging-service.co.tz
 *   NEXTSMS_SINGLE_PATH default /api/sms/v1/text/single
 *   NEXTSMS_BULK_PATH   default /api/sms/v1/text/multi
 *   NEXTSMS_USERNAME    account username
 *   NEXTSMS_PASSWORD    account password
 *   NEXTSMS_SENDER_ID   approved sender name, e.g. SHULE
 *
 * Confirm the paths and sender id against your NextSMS dashboard before going
 * live; the credentials and sender id are account-specific either way.
 */

const DEFAULTS = {
  baseUrl: 'https://messaging-service.co.tz',
  singlePath: '/api/sms/v1/text/single',
  bulkPath: '/api/sms/v1/text/multi',
}

function config() {
  return {
    baseUrl: (process.env.NEXTSMS_BASE_URL || DEFAULTS.baseUrl).replace(/\/+$/, ''),
    singlePath: process.env.NEXTSMS_SINGLE_PATH || DEFAULTS.singlePath,
    bulkPath: process.env.NEXTSMS_BULK_PATH || DEFAULTS.bulkPath,
    username: process.env.NEXTSMS_USERNAME || '',
    password: process.env.NEXTSMS_PASSWORD || '',
    senderId: process.env.NEXTSMS_SENDER_ID || 'SHULE',
  }
}

/** NextSMS authenticates with HTTP Basic over base64(username:password). */
function authHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

/**
 * Their response nests per-recipient outcomes under `messages`, each carrying a
 * `messageId` and a `status` object. We read defensively: a provider changing a
 * field name should degrade to "delivered, id unknown", never throw.
 */
function readResults(body: any, submitted: { to: string; msisdn: string }[]): SmsSendResult[] {
  const entries: any[] = Array.isArray(body?.messages) ? body.messages : []
  return submitted.map((s, i) => {
    const entry = entries[i] ?? entries.find((e) => String(e?.to ?? '').includes(s.msisdn))
    const groupName = entry?.status?.groupName ?? entry?.status?.name ?? ''
    // PENDING and DELIVERED are both accepted at submission time; REJECTED is not.
    const rejected = /REJECT|UNDELIVER|FAIL/i.test(String(groupName))
    return {
      to: s.to,
      msisdn: s.msisdn,
      delivered: !rejected,
      providerId: entry?.messageId ? String(entry.messageId) : undefined,
      error: rejected ? String(entry?.status?.description ?? groupName) : undefined,
    }
  })
}

export const nextSmsProvider: SmsProvider = {
  name: 'nextsms',

  configured() {
    const c = config()
    return Boolean(c.username && c.password)
  },

  async send(messages: SmsMessage[]): Promise<SmsSendResult[]> {
    const c = config()

    // Reject unusable numbers per-recipient so one bad entry cannot sink a broadcast.
    const prepared = messages.map((m) => ({ ...m, msisdn: normaliseTzPhone(m.to) }))
    const bad = prepared
      .filter((p) => !p.msisdn)
      .map<SmsSendResult>((p) => ({ to: p.to, msisdn: '', delivered: false, error: 'Not a valid Tanzanian number' }))
    const good = prepared.filter((p): p is typeof p & { msisdn: string } => Boolean(p.msisdn))
    if (good.length === 0) return bad

    if (!this.configured()) {
      return [
        ...bad,
        ...good.map<SmsSendResult>((p) => ({
          to: p.to, msisdn: p.msisdn, delivered: false,
          error: 'NextSMS credentials are not configured',
        })),
      ]
    }

    const bulk = good.length > 1
    const url = c.baseUrl + (bulk ? c.bulkPath : c.singlePath)
    const payload = bulk
      ? { messages: good.map((p) => ({ from: c.senderId, to: p.msisdn, text: p.text })) }
      : { from: c.senderId, to: good[0].msisdn, text: good[0].text }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader(c.username, c.password),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        // A broadcast must not hang a request handler indefinitely.
        signal: AbortSignal.timeout(20_000),
      })

      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const reason = body?.requestError?.serviceException?.text ?? body?.message ?? `HTTP ${res.status}`
        return [
          ...bad,
          ...good.map<SmsSendResult>((p) => ({ to: p.to, msisdn: p.msisdn, delivered: false, error: String(reason) })),
        ]
      }
      return [...bad, ...readResults(body, good)]
    } catch (e: any) {
      const reason = e?.name === 'TimeoutError' ? 'NextSMS did not respond in time' : e?.message ?? 'Network error'
      return [
        ...bad,
        ...good.map<SmsSendResult>((p) => ({ to: p.to, msisdn: p.msisdn, delivered: false, error: String(reason) })),
      ]
    }
  },
}
