import { CheckCircle2, MessageSquare, Receipt, FileText } from 'lucide-react'

/**
 * Product vignettes for the marketing site: the documents and messages a school
 * actually produces with Shule SMS, drawn in HTML rather than pasted as
 * screenshots. Content is illustrative but shaped exactly like the real output
 * (receipt numbers, NECTA-style grade bands, Swahili SMS to parents).
 */

export function ReportCardVignette({ className = '' }: { className?: string }) {
  const rows = [
    ['Mathematics', 'Mid-term', 82, 'A'],
    ['Kiswahili', 'Mid-term', 74, 'B'],
    ['Physics', 'Mid-term', 61, 'C'],
    ['History', 'Mid-term', 88, 'A'],
  ] as const
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-[0_20px_50px_-24px_hsl(var(--foreground)/0.35)] ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Student report card</p>
          <p className="mt-1 font-display text-sm font-bold">Kilimanjaro Academy</p>
          <p className="text-xs text-muted-foreground">Form 2A · Term 2, 2026</p>
        </div>
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1.5 font-medium">Subject</th>
            <th className="pb-1.5 font-medium">Assessment</th>
            <th className="pb-1.5 text-right font-medium">Marks</th>
            <th className="pb-1.5 text-right font-medium">Grade</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map(([s, a, m, g]) => (
            <tr key={s} className="border-t border-border/60">
              <td className="py-1.5 font-medium">{s}</td>
              <td className="py-1.5 text-muted-foreground">{a}</td>
              <td className="py-1.5 text-right">{m} / 100</td>
              <td className="py-1.5 text-right">
                <span className={`inline-block rounded px-1.5 py-0.5 font-semibold ${g === 'A' ? 'bg-secondary/15 text-secondary' : g === 'B' ? 'bg-primary/12 text-primary' : 'bg-muted text-foreground'}`}>
                  {g}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">Average</span>
        <span className="font-display text-base font-bold text-primary tabular-nums">76.3%</span>
      </div>
    </div>
  )
}

export function ReceiptVignette({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-[0_16px_40px_-24px_hsl(var(--foreground)/0.35)] ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
          <Receipt className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Fee payment received</p>
          <p className="font-mono text-[11px] text-muted-foreground">RCP-2026-00042</p>
        </div>
        <span className="ml-auto font-display text-sm font-bold tabular-nums">TZS 250,000</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div><p className="text-muted-foreground">Pupil</p><p className="font-medium">Chiku Mero</p></div>
        <div><p className="text-muted-foreground">Fee</p><p className="font-medium">Tuition · Term 2</p></div>
        <div><p className="text-muted-foreground">Method</p><p className="font-medium">M-Pesa</p></div>
      </div>
    </div>
  )
}

export function SmsVignette({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-[0_16px_40px_-24px_hsl(var(--foreground)/0.35)] ${className}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/25 text-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
        </span>
        <span className="font-semibold">SMS to parents</span>
        <span className="ml-auto text-muted-foreground">Sender · SHULE</span>
      </div>
      <p className="mt-3 rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-xs leading-relaxed">
        Wazazi wapendwa, mkutano wa wazazi utafanyika Jumamosi saa 3 asubuhi. Karibuni.
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-secondary" />
        Sent to 412 parents · 1 segment each · 412 segments
      </div>
    </div>
  )
}
