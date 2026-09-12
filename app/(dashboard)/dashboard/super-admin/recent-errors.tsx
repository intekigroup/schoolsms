import { prisma } from '@/lib/db'

/** The platform's last unhandled errors, grouped by fingerprint — shown on the super-admin console. */
export async function RecentErrors() {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const rows = await prisma.errorLog.groupBy({ by: ['fingerprint'], where: { createdAt: { gte: since } }, _count: { _all: true }, _max: { createdAt: true } })
  if (rows.length === 0) return null
  const latest = await prisma.errorLog.findMany({ where: { fingerprint: { in: rows.map((r) => r.fingerprint) } }, orderBy: { createdAt: 'desc' }, distinct: ['fingerprint'], select: { fingerprint: true, message: true, path: true, method: true } })
  const byFp = new Map(latest.map((l) => [l.fingerprint, l]))
  const list = rows.map((r) => ({ ...r, ...byFp.get(r.fingerprint)! })).sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0)).slice(0, 15)
  return (
    <div className="rounded-lg border border-red-300/60 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Server errors in the last 7 days</p>
      <ul className="mt-2 divide-y divide-red-200/60 text-sm dark:divide-red-900">
        {list.map((e) => (
          <li key={e.fingerprint} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate"><span className="font-mono text-xs text-muted-foreground">{e.method} {e.path}</span> <span className="ml-1">{e.message}</span></span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">×{e._count._all} · {e._max.createdAt?.toISOString().slice(0, 16).replace('T', ' ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
