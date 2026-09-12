import { prisma } from '@/lib/db'
import { sendMail, mailTransport } from '@/lib/mailer'

/**
 * Email to parents, the sibling of lib/sms: one send per recipient, one log
 * row each (channel "email"), and an honest count of what was accepted.
 * Without an SMTP transport nothing is sent and every row is "failed".
 */
export interface EmailRecipient { to: string; label?: string }
export interface EmailDispatch { configured: boolean; requested: number; delivered: number; failed: number; results: { to: string; delivered: boolean; error?: string }[] }

export function emailConfigured() { return mailTransport() === 'smtp' }

export async function sendEmailBroadcast(schoolId: string, recipients: EmailRecipient[], subject: string, text: string, fromName?: string): Promise<EmailDispatch> {
  const configured = emailConfigured()
  const results: EmailDispatch['results'] = []
  for (const r of recipients) {
    if (!configured) { results.push({ to: r.to, delivered: false, error: 'No mail server configured' }); continue }
    try {
      const res = await sendMail({ to: r.to, subject, text: `${r.label ? `Dear ${r.label},\n\n` : ''}${text}${fromName ? `\n\n— ${fromName}` : ''}` })
      results.push(res.delivered ? { to: r.to, delivered: true } : { to: r.to, delivered: false, error: res.reason })
    } catch (e: any) { results.push({ to: r.to, delivered: false, error: e?.message ?? 'send failed' }) }
  }
  try {
    if (results.length) await prisma.smsLog.createMany({ data: results.map((r) => ({ schoolId, phone: r.to, message: text.slice(0, 1000), subject: subject.slice(0, 200), channel: 'email', status: r.delivered ? 'sent' : `failed: ${r.error}`.slice(0, 190) })) })
  } catch (e) { console.error('email log write failed', e) }
  return { configured, requested: results.length, delivered: results.filter((r) => r.delivered).length, failed: results.filter((r) => !r.delivered).length, results }
}
