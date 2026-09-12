import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Outbound email.
 *
 * Two transports:
 *   console (default) — writes the message to the server log. Nothing is
 *     delivered, and every caller is told so, so the UI can be honest about it.
 *   smtp — real delivery through the SMTP server configured in .env.
 *
 * Set MAIL_TRANSPORT=smtp plus SMTP_HOST/SMTP_PORT and, for most providers,
 * SMTP_USER/SMTP_PASS. MAIL_FROM sets the visible sender.
 */

export interface Mail {
  to: string
  subject: string
  text: string
}

export type MailResult =
  | { delivered: true; transport: 'smtp'; messageId: string }
  | { delivered: false; transport: 'console'; reason: string }
  | { delivered: false; transport: 'smtp'; reason: string }

export function mailTransport(): 'console' | 'smtp' {
  return process.env.MAIL_TRANSPORT === 'smtp' ? 'smtp' : 'console'
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || 'Shule SMS <no-reply@shulesms.tz>'
}

/**
 * One pooled transporter per process. Rebuilt if the configuration changes,
 * which keeps tests able to point it at a local sink without a restart.
 */
let cached: { key: string; transporter: Transporter } | null = null

function smtpConfig() {
  const host = process.env.SMTP_HOST ?? ''
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER ?? ''
  const pass = process.env.SMTP_PASS ?? ''
  // Implicit TLS on 465; STARTTLS is negotiated on everything else.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465
  return { host, port, user, pass, secure }
}

function transporter(): Transporter {
  const cfg = smtpConfig()
  const key = JSON.stringify(cfg)
  if (cached?.key === key) return cached.transporter

  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Local sinks and many self-hosted relays have no usable certificate.
    ignoreTLS: process.env.SMTP_IGNORE_TLS === 'true',
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
    pool: true,
    maxConnections: 3,
  })
  cached = { key, transporter: t }
  return t
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (mailTransport() === 'smtp') {
    const cfg = smtpConfig()
    if (!cfg.host) {
      // Misconfiguration should be loud, not a silently dropped reset link.
      console.error('MAIL_TRANSPORT=smtp but SMTP_HOST is not set — nothing was sent')
      return { delivered: false, transport: 'smtp', reason: 'SMTP_HOST is not configured' }
    }
    try {
      const info = await transporter().sendMail({
        from: mailFrom(),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      })
      return { delivered: true, transport: 'smtp', messageId: info.messageId }
    } catch (e: any) {
      // Never let a mail failure surface as a 500 to the caller; the routes
      // that send are deliberately non-enumerating and answer the same either way.
      console.error('SMTP delivery failed:', e?.message ?? e)
      return { delivered: false, transport: 'smtp', reason: e?.message ?? 'SMTP delivery failed' }
    }
  }

  console.log(
    [
      '',
      '─── EMAIL (not sent — no provider configured) ───',
      `To:      ${mail.to}`,
      `Subject: ${mail.subject}`,
      '',
      mail.text,
      '────────────────────────────────────────────────',
      '',
    ].join('\n')
  )

  return { delivered: false, transport: 'console', reason: 'No email provider configured' }
}
