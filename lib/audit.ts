import type { Session } from 'next-auth'
import { prisma } from '@/lib/db'

/**
 * Audit trail for money and grades.
 *
 * Nothing previously recorded who altered an exam mark or recorded a payment.
 * `record` is deliberately non-throwing: an audit write must never be the reason
 * a legitimate payment or mark fails to save. Failures are logged instead.
 */

export interface AuditEntry {
  action: 'create' | 'update' | 'delete' | 'export'
  entity: string
  entityId?: string | null
  /** Human-readable, e.g. "Recorded TZS 25,000 for Baraka Kimaro (receipt RCP-2026-00042)". */
  summary: string
}

export async function record(session: Session | null, entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        actorId: session?.user?.id ?? null,
        actorName: session?.user?.name ?? 'unknown',
        actorRole: session?.user?.role ?? 'unknown',
        schoolId: session?.user?.schoolId ?? null,
      },
    })
  } catch (e) {
    console.error('audit write failed:', e)
  }
}

/** Money formatted the way the audit trail should read it. */
export function tzs(amount: number) {
  return `TZS ${Math.round(amount).toLocaleString('en-GB')}`
}
