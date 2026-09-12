import { prisma } from '@/lib/db'
import type { SmsProvider, SmsMessage, SmsSendResult } from './types'
import { normaliseTzPhone, segmentCount } from './types'
import { nextSmsProvider } from './nextsms'

export * from './types'

/**
 * SMS dispatch.
 *
 * `SMS_PROVIDER` selects the transport. `console` is the default so nothing
 * sends — or costs — until a school configures an account, and the UI is told
 * which transport ran so it can say so plainly.
 *
 * Registering IntekiSMS later means adding one entry here and a file beside
 * nextsms.ts; nothing else changes.
 */

const consoleProvider: SmsProvider = {
  name: 'console',
  configured: () => true,
  async send(messages) {
    return messages.map((m) => {
      const msisdn = normaliseTzPhone(m.to)
      if (!msisdn) {
        return { to: m.to, msisdn: '', delivered: false, error: 'Not a valid Tanzanian number' }
      }
      console.log(
        `\n─── SMS (not sent — no provider configured) ───\nTo:   +${msisdn}\nText: ${m.text}\n──────────────────────────────────────────────\n`
      )
      return { to: m.to, msisdn, delivered: false, error: 'No SMS provider configured' }
    })
  },
}

const PROVIDERS: Record<string, SmsProvider> = {
  console: consoleProvider,
  nextsms: nextSmsProvider,
  // intekisms: intekiSmsProvider,  ← planned
}

export function smsProvider(): SmsProvider {
  const key = (process.env.SMS_PROVIDER || 'console').toLowerCase()
  return PROVIDERS[key] ?? consoleProvider
}

/** True when a real provider is selected AND has its credentials. */
export function smsConfigured(): boolean {
  const p = smsProvider()
  return p.name !== 'console' && p.configured()
}

export interface SmsDispatch {
  provider: string
  requested: number
  delivered: number
  failed: number
  segments: number
  results: SmsSendResult[]
}

/**
 * Sends and records every attempt in `SmsLog` — the model that has existed
 * since the first schema and never had a writer. Logging is per-recipient so a
 * partial failure is visible rather than averaged away.
 */
export async function sendSms(schoolId: string, messages: SmsMessage[]): Promise<SmsDispatch> {
  const provider = smsProvider()
  if (messages.length === 0) {
    return { provider: provider.name, requested: 0, delivered: 0, failed: 0, segments: 0, results: [] }
  }

  const results = await provider.send(messages)

  try {
    await prisma.smsLog.createMany({
      data: results.map((r, i) => ({
        phone: r.msisdn || r.to,
        message: messages[i]?.text ?? '',
        status: r.delivered ? 'sent' : `failed: ${r.error ?? 'unknown'}`.slice(0, 190),
        schoolId,
      })),
    })
  } catch (e) {
    // A logging failure must not lose an SMS that already went out.
    console.error('sms log write failed:', e)
  }

  const delivered = results.filter((r) => r.delivered).length
  return {
    provider: provider.name,
    requested: messages.length,
    delivered,
    failed: results.length - delivered,
    segments: messages.reduce((n, m) => n + segmentCount(m.text), 0),
    results,
  }
}
