'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import type { LeaveType } from '@/lib/hr/settings'
import type { LeaveBalance } from '@/lib/hr/leave'

interface Props {
  me: { id: string; firstName: string; lastName: string; employeeNo: string; role: string; employmentType: string; hireDate: string | null; contractEnd: string | null; department: string | null }
  leaveTypes: LeaveType[]
  balances: LeaveBalance[]
  year: number
  payslips: { id: string; number: string; net: number; gross: number; paye: number; nssf: number; runId: string; period: string; status: string }[]
}
const tzs = (n: number) => `TSh ${Math.round(n).toLocaleString('en-GB')}`
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const today = () => new Date().toISOString().slice(0, 10)

export function MyHrClient({ me, leaveTypes, balances, year, payslips }: Props) {
  const [requests, setRequests] = useState<any[]>([])
  const [form, setForm] = useState({ type: leaveTypes[0]?.key ?? 'ANNUAL', startDate: today(), endDate: today(), reason: '' })
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => fetch(`/api/hr/leave?year=${year}`).then((r) => r.json()).then((d) => setRequests(d.requests ?? [])).catch(() => {}), [year])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/hr/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not submit'); return }
      toast.success('Leave request sent for approval'); setForm({ ...form, reason: '' }); load()
    } finally { setBusy(false) }
  }
  const cancel = async (id: string) => {
    const res = await fetch('/api/hr/leave', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'cancel' }) })
    if (!res.ok) { toast.error('Could not cancel'); return }
    load()
  }
  const badge = (s: string) => <Badge variant={s === 'APPROVED' ? 'default' : s === 'PENDING' ? 'secondary' : s === 'REJECTED' ? 'destructive' : 'outline'}>{s}</Badge>

  return (
    <div className="space-y-6">
      <FadeIn><div>
        <h1 className="font-display text-2xl font-bold tracking-tight">My leave & pay</h1>
        <p className="text-muted-foreground mt-1">{me.firstName} {me.lastName} · {me.role}{me.department ? ` · ${me.department}` : ''} · {me.employeeNo} · {me.employmentType.replace('_', ' ').toLowerCase()}{me.hireDate ? ` since ${fmt(me.hireDate)}` : ''}{me.contractEnd ? ` · contract to ${fmt(me.contractEnd)}` : ''}</p>
      </div></FadeIn>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Leave balance · {year}</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {balances.map((b) => (
                <div key={b.key} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{b.name}{b.paid ? '' : ' (unpaid)'}</p>
                  <p className="font-mono text-lg font-semibold">{b.remaining === null ? `${b.taken} taken` : `${b.remaining} left`}</p>
                  <p className="text-xs text-muted-foreground">{b.entitlement ? `${b.taken} of ${b.entitlement} used` : 'no fixed cap'}{b.pending ? ` · ${b.pending} pending` : ''}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">My requests</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Type</th><th className="p-3">Dates</th><th className="p-3">Days</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
                <tbody>{requests.map((r) => (
                  <tr key={r.id} className="border-b"><td className="p-3">{r.typeName}</td><td className="p-3 text-xs">{fmt(r.startDate)} – {fmt(r.endDate)}</td><td className="p-3 font-mono">{r.days}</td><td className="p-3">{badge(r.status)}{r.reviewNote ? <span className="block text-xs text-muted-foreground">{r.reviewNote}</span> : null}</td>
                    <td className="p-3">{r.status === 'PENDING' && <Button size="sm" variant="ghost" className="h-7" onClick={() => cancel(r.id)}>Withdraw</Button>}</td></tr>
                ))}{requests.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No requests this year.</td></tr>}</tbody></table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payslips</CardTitle><CardDescription>Available once the bursar approves the month&apos;s payroll.</CardDescription></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Month</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">PAYE</th><th className="p-3 text-right">NSSF</th><th className="p-3 text-right">Net</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
                <tbody>{payslips.map((p) => (
                  <tr key={p.id} className="border-b"><td className="p-3 font-medium">{p.period}<span className="block text-xs text-muted-foreground font-mono">{p.number}</span></td><td className="p-3 text-right font-mono">{tzs(p.gross)}</td><td className="p-3 text-right font-mono">{tzs(p.paye)}</td><td className="p-3 text-right font-mono">{tzs(p.nssf)}</td><td className="p-3 text-right font-mono font-semibold">{tzs(p.net)}</td><td className="p-3">{badge(p.status)}</td>
                    <td className="p-3"><Button asChild variant="ghost" size="icon-sm" title="Download payslip"><a href={`/api/hr/payroll/${p.runId}?format=payslip`}><FileDown className="w-4 h-4" /></a></Button></td></tr>
                ))}{payslips.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No payslips yet.</td></tr>}</tbody></table>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader className="pb-2"><CardTitle className="text-base">Request leave</CardTitle><CardDescription>Counted in working days; weekends are skipped.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1"><Label className="text-xs">Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{leaveTypes.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div><div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div></div>
            <div className="space-y-1"><Label className="text-xs">Reason</Label><Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <Button onClick={submit} disabled={busy || form.reason.trim().length < 3} className="w-full">{busy ? 'Sending…' : 'Send for approval'}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
