/**
 * SMS provider contract.
 *
 * SMS is how Tanzanian schools actually reach parents, so this is a first-class
 * channel rather than a bolt-on. Providers are pluggable: `console` (default,
 * logs and delivers nothing), `nextsms` today, `intekisms` planned. Adding one
 * means implementing `SmsProvider` and registering it — no call site changes.
 */

export interface SmsMessage {
  /** Recipient in local or international form; normalised before sending. */
  to: string
  text: string
}

export interface SmsSendResult {
  to: string
  /** Normalised MSISDN actually submitted, e.g. 255712345678. */
  msisdn: string
  delivered: boolean
  /** Provider's own id, when it returns one. */
  providerId?: string
  error?: string
}

export interface SmsProvider {
  name: string
  /** True when the provider has everything it needs to actually send. */
  configured(): boolean
  send(messages: SmsMessage[]): Promise<SmsSendResult[]>
}

/**
 * Normalises a Tanzanian number to the MSISDN form providers expect
 * (255XXXXXXXXX, no plus). Returns null when it cannot be salvaged, so a bad
 * number is reported per-recipient instead of failing a whole broadcast.
 *
 * Accepts: 0712345678, +255712345678, 255712345678, 712345678, and any of
 * those with spaces, dashes or brackets.
 */
export function normaliseTzPhone(raw: string): string | null {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!digits) return null

  let msisdn: string
  if (digits.startsWith('255')) msisdn = digits
  else if (digits.startsWith('0')) msisdn = `255${digits.slice(1)}`
  else if (digits.length === 9) msisdn = `255${digits}`
  else return null

  // Tanzanian mobile numbers are 255 followed by 9 digits, and the subscriber
  // part never starts with 0.
  if (!/^255[1-9]\d{8}$/.test(msisdn)) return null
  return msisdn
}

/**
 * GSM-03.38 messages are 160 characters; anything outside that alphabet forces
 * UCS-2 at 70. Concatenated parts lose 7 (or 3) characters each to the header.
 */
export function segmentCount(text: string): number {
  const gsm = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(text)
  const single = gsm ? 160 : 70
  const multi = gsm ? 153 : 67
  if (text.length <= single) return 1
  return Math.ceil(text.length / multi)
}
