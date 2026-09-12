'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Settings2, Users, CalendarCheck, Plane, Wallet, Plus, Trash2, FileDown, Check, X, RefreshCw, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Paginator } from '@/components/ui/paginator'
import type { HrConfig } from '@/lib/hr/settings'

/** HR & Payroll — the admin's console. Staff self-service lives at /dashboard/hr/me. */

interface Overview { headcount: number; onLeave: number; pendingLeave: number; contractsEnding: { id: string; name: string; contractEnd: string }[]; lastRun: { id: string; period: string; status: string; totalNet: number } | null }
interface PayItem { id: string; name: string; kind: 'ALLOWANCE' | 'DEDUCTION'; amount: number; taxable: boolean; active: boolean }
interface StaffRow { id: string; employeeNo: string; firstName: string; lastName: string; role: string; phone: string | null; qualification: string | null; status: string; salary: number; employmentType: string; department: string | null; hireDate: string | null; contractEnd: string | null; tin: string | null; nssfNo: string | null; bankName: string | null; bankAccount: string | null; userId: string | null; payItems: PayItem[] }
interface AttendanceRow { id: string; name: string; employeeNo: string; role: string; status: string | null; remarks: string | null; onLeave: string | null }
interface LeaveRow { id: string; staffId: string; staffName: string; employeeNo: string; role: string; type: string; typeName: string; startDate: string; endDate: string; days: number; reason: string; status: string; reviewNote: string | null }
interface Run { id: string; period: string; label: string; status: string; staffCount: number; totalGross: number; totalNet: number; totalPaye: number; totalNssfEmployee: number; totalNssfEmployer: number; totalSdl: number; totalWcf: number; totalDeductions: number; notes: string | null; approvedAt: string | null; paidAt: string | null }
interface Slip { id: string; number: string; staffId: string; staffName: string; employeeNo: string; role: string; basic: number; gross: number; nssfEmployee: number; paye: number; otherDeductions: number; net: number; bankName: string | null; bankAccount: string | null }

const tzs = (n: number) => `TSh ${Math.round(n).toLocaleString('en-GB')}`
const iso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const thisMonth = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)
const EMPLOYMENT = ['PERMANENT', 'CONTRACT', 'PART_TIME', 'VOLUNTEER', 'INTERN']
const STAFF_STATUS = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED']

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d?.error ?? 'Request failed')
  return d
}
const download = (href: string) => { const a = document.createElement('a'); a.href = href; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a) }

export function HrClient({ config, overview }: { config: HrConfig; overview: Overview }) {
  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">HR & Payroll</h1>
            <p className="text-muted-foreground mt-1">Employment records, staff attendance, leave and monthly payroll with PAYE and NSSF.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/dashboard/settings?tab=hr"><Settings2 className="w-4 h-4" /> HR settings</Link></Button>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Staff on payroll" value={String(overview.headcount)} />
        <Stat label="On leave today" value={String(overview.onLeave)} />
        <Stat label="Leave awaiting approval" value={String(overview.pendingLeave)} tone={overview.pendingLeave ? 'warn' : undefined} />
        <Stat label={overview.lastRun ? `Payroll ${overview.lastRun.period} · ${overview.lastRun.status.toLowerCase()}` : 'Payroll'} value={overview.lastRun ? tzs(overview.lastRun.totalNet) : 'No runs yet'} />
      </div>
      {overview.contractsEnding.length > 0 && (
        <Card className="border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Contracts ending within 60 days</p>
            <p className="text-muted-foreground">{overview.contractsEnding.map((c) => `${c.name} (${fmt(c.contractEnd)})`).join(' · ')}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="staff">
        <TabsList className="flex-wrap">
          <TabsTrigger value="staff" className="gap-1.5"><Users className="w-4 h-4" />Staff</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><CalendarCheck className="w-4 h-4" />Attendance</TabsTrigger>
          <TabsTrigger value="leave" className="gap-1.5"><Plane className="w-4 h-4" />Leave</TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5"><Wallet className="w-4 h-4" />Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="staff"><StaffTab /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab /></TabsContent>
        <TabsContent value="leave"><LeaveTab config={config} /></TabsContent>
        <TabsContent value="payroll"><PayrollTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return <Card className={tone === 'warn' ? 'border-amber-400/60' : ''}><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{value}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></CardContent></Card>
}

// ─── Staff ──────────────────────────────────────────────────────────────────

function StaffTab() {
  const [rows, setRows] = useState<StaffRow[]>([])
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<StaffRow | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [item, setItem] = useState({ name: '', kind: 'ALLOWANCE', amount: '', taxable: true })

  const load = useCallback(() => call('/api/hr/staff').then((d) => setRows(d.staff)).catch((e) => toast.error(e.message)), [])
  useEffect(() => { load() }, [load])

  const open = (s: StaffRow) => {
    setEdit(s)
    setForm({ employmentType: s.employmentType, department: s.department ?? '', hireDate: iso(s.hireDate), contractEnd: iso(s.contractEnd), tin: s.tin ?? '', nssfNo: s.nssfNo ?? '', bankName: s.bankName ?? '', bankAccount: s.bankAccount ?? '', salary: String(s.salary), qualification: s.qualification ?? '', status: s.status })
  }
  const save = async () => {
    if (!edit) return
    setSaving(true)
    try {
      await call('/api/hr/staff', { method: 'PATCH', body: JSON.stringify({ id: edit.id, ...form, salary: Number(form.salary) || 0, hireDate: form.hireDate || null, contractEnd: form.contractEnd || null }) })
      toast.success('Employment details saved'); await load(); setEdit(null)
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const addItem = async () => {
    if (!edit) return
    try {
      await call('/api/hr/pay-items', { method: 'POST', body: JSON.stringify({ staffId: edit.id, name: item.name, kind: item.kind, amount: Number(item.amount) || 0, taxable: item.taxable }) })
      setItem({ name: '', kind: 'ALLOWANCE', amount: '', taxable: true })
      const d = await call(`/api/hr/staff?id=${edit.id}`); setEdit(d.staff[0]); load()
    } catch (e: any) { toast.error(e.message) }
  }
  const removeItem = async (id: string) => {
    try { await call(`/api/hr/pay-items?id=${id}`, { method: 'DELETE' }); const d = await call(`/api/hr/staff?id=${edit!.id}`); setEdit(d.staff[0]); load() } catch (e: any) { toast.error(e.message) }
  }

  const filtered = rows.filter((s) => `${s.firstName} ${s.lastName} ${s.employeeNo} ${s.role} ${s.department ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="space-y-3">
      <Input placeholder="Search staff" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Staff</th><th className="p-3">Position</th><th className="p-3">Type</th><th className="p-3">Hired</th><th className="p-3 text-right">Basic / month</th><th className="p-3">Pay items</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="p-3"><p className="font-medium">{s.firstName} {s.lastName}</p><p className="text-xs text-muted-foreground font-mono">{s.employeeNo}{s.userId ? '' : ' · no login'}</p></td>
                <td className="p-3">{s.role}{s.department ? <span className="block text-xs text-muted-foreground">{s.department}</span> : null}</td>
                <td className="p-3 text-xs">{s.employmentType.replace('_', ' ')}{s.contractEnd ? <span className="block text-muted-foreground">to {fmt(s.contractEnd)}</span> : null}</td>
                <td className="p-3 text-xs">{s.hireDate ? fmt(s.hireDate) : '—'}</td>
                <td className="p-3 text-right font-mono">{tzs(s.salary)}</td>
                <td className="p-3 text-xs">{s.payItems.length ? s.payItems.map((i) => `${i.kind === 'DEDUCTION' ? '−' : '+'}${i.name}`).join(', ') : '—'}</td>
                <td className="p-3"><Badge variant={s.status === 'ACTIVE' ? 'default' : 'secondary'}>{s.status.replace('_', ' ')}</Badge></td>
                <td className="p-3"><Button variant="ghost" size="icon-sm" onClick={() => open(s)}><Pencil className="w-4 h-4" /></Button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No staff.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.firstName} {edit?.lastName} — employment</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs">Employment type</Label>
                  <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EMPLOYMENT.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAFF_STATUS.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Sciences, Administration" /></div>
                <div className="space-y-1"><Label className="text-xs">Qualification</Label><Input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Hire date</Label><Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Contract end (blank if permanent)</Label><Input type="date" value={form.contractEnd} onChange={(e) => setForm({ ...form, contractEnd: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Basic salary / month (TZS)</Label><Input type="number" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">TIN</Label><Input value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">NSSF number</Label><Input value={form.nssfNo} onChange={(e) => setForm({ ...form, nssfNo: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Bank</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. CRDB" /></div>
                <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Bank account</Label><Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} /></div>
              </div>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save employment details'}</Button>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Recurring allowances & deductions</p>
                {edit.payItems.length === 0 && <p className="text-xs text-muted-foreground">None — payroll uses basic salary only.</p>}
                {edit.payItems.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span>{i.kind === 'DEDUCTION' ? '−' : '+'} {i.name} <span className="text-xs text-muted-foreground">{i.kind === 'ALLOWANCE' ? (i.taxable ? '· taxable' : '· non-taxable') : ''}</span></span>
                    <span className="flex items-center gap-2 font-mono">{tzs(i.amount)}<Button variant="ghost" size="icon-sm" onClick={() => removeItem(i.id)}><Trash2 className="w-4 h-4" /></Button></span>
                  </div>
                ))}
                <div className="grid gap-2 sm:grid-cols-[1fr_130px_120px_auto_auto] items-end pt-2">
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="e.g. Housing allowance, SACCOS loan" /></div>
                  <div className="space-y-1"><Label className="text-xs">Kind</Label><Select value={item.kind} onValueChange={(v) => setItem({ ...item, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALLOWANCE">Allowance</SelectItem><SelectItem value="DEDUCTION">Deduction</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-xs">TZS / month</Label><Input type="number" min={0} value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} /></div>
                  {item.kind === 'ALLOWANCE' ? <label className="flex items-center gap-1 text-xs pb-2"><input type="checkbox" checked={item.taxable} onChange={(e) => setItem({ ...item, taxable: e.target.checked })} />Taxable</label> : <span />}
                  <Button size="sm" onClick={addItem} disabled={!item.name || !item.amount} className="gap-1"><Plus className="w-4 h-4" />Add</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Attendance ─────────────────────────────────────────────────────────────

function AttendanceTab() {
  const [date, setDate] = useState(today())
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [month, setMonth] = useState(thisMonth())
  const [summary, setSummary] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const empty = { page: 1, pageSize: 50, total: 0 }
  const [page, setPage] = useState(1), [paging, setPaging] = useState(empty)
  const [sumPage, setSumPage] = useState(1), [sumPaging, setSumPaging] = useState(empty)
  const pick = (d: any) => ({ page: d.page, pageSize: d.pageSize, total: d.total })

  useEffect(() => { call(`/api/hr/attendance?date=${date}&page=${page}`).then((d) => { setRows(d.staff); setPaging(pick(d)) }).catch((e) => toast.error(e.message)) }, [date, page])
  useEffect(() => { call(`/api/hr/attendance?month=${month}&page=${sumPage}`).then((d) => { setSummary(d.staff); setSumPaging(pick(d)) }).catch(() => {}) }, [month, sumPage])

  const mark = (id: string, status: string) => setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)))
  const markAll = (status: string) => setRows((r) => r.map((x) => (x.onLeave ? x : { ...x, status })))
  const save = async () => {
    const entries = rows.filter((r) => r.status).map((r) => ({ staffId: r.id, status: r.status, remarks: r.remarks }))
    if (!entries.length) { toast.error('Nothing marked'); return }
    setSaving(true)
    try { const d = await call('/api/hr/attendance', { method: 'PUT', body: JSON.stringify({ date, entries }) }); toast.success(`Saved ${d.saved} marks`); call(`/api/hr/attendance?month=${month}&page=${sumPage}`).then((x) => { setSummary(x.staff); setSumPaging(pick(x)) }) } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const S = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="pb-2"><div className="flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-1"><Label className="text-xs">Register for</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => markAll('PRESENT')}>All present</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save register'}</Button></div>
        </div></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Staff</th><th className="p-3">Mark</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-3"><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.role}{r.onLeave ? ` · on ${r.onLeave.toLowerCase()} leave` : ''}</p></td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{S.map((s) => <Button key={s} size="sm" variant={r.status === s ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => mark(r.id, s)}>{s[0] + s.slice(1).toLowerCase()}</Button>)}</div></td>
              </tr>
            ))}{rows.length === 0 && <tr><td colSpan={2} className="p-6 text-center text-muted-foreground">No active staff.</td></tr>}</tbody>
          </table>
          <Paginator page={paging.page} pageSize={paging.pageSize} total={paging.total} onPage={setPage} className="border-t" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><div className="space-y-1"><Label className="text-xs">Month summary</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" /></div></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-muted/50 text-left"><th className="p-2">Staff</th><th className="p-2 text-right">P</th><th className="p-2 text-right">L</th><th className="p-2 text-right">A</th><th className="p-2 text-right">E</th></tr></thead>
            <tbody>{summary.map((s) => <tr key={s.id} className="border-b"><td className="p-2">{s.name}</td><td className="p-2 text-right font-mono">{s.present}</td><td className="p-2 text-right font-mono">{s.late}</td><td className={`p-2 text-right font-mono ${s.absent ? 'text-red-600' : ''}`}>{s.absent}</td><td className="p-2 text-right font-mono">{s.excused}</td></tr>)}</tbody>
          </table>
          <Paginator page={sumPaging.page} pageSize={sumPaging.pageSize} total={sumPaging.total} onPage={setSumPage} className="border-t" />
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Leave ──────────────────────────────────────────────────────────────────

function LeaveTab({ config }: { config: HrConfig }) {
  const [year, setYear] = useState(new Date().getUTCFullYear())
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [pending, setPending] = useState<LeaveRow[]>([])
  const [page, setPage] = useState(1), [paging, setPaging] = useState({ page: 1, pageSize: 50, total: 0 })
  const [pendingTotal, setPendingTotal] = useState(0)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [form, setForm] = useState({ staffId: '', type: config.leaveTypes[0]?.key ?? 'ANNUAL', startDate: today(), endDate: today(), reason: '' })
  const [balances, setBalances] = useState<any[]>([])
  const [balStaff, setBalStaff] = useState('')

  // The queue is its own list so a request waiting for approval never hides on a later page of the year's history.
  const load = useCallback(() => Promise.all([
    call(`/api/hr/leave?year=${year}&page=${page}`).then((d) => { setRows(d.requests); setPaging({ page: d.page, pageSize: d.pageSize, total: d.total }) }),
    call(`/api/hr/leave?year=${year}&status=PENDING`).then((d) => { setPending(d.requests); setPendingTotal(d.total) }),
  ]).catch((e) => toast.error(e.message)), [year, page])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [year])
  useEffect(() => { call('/api/hr/staff').then((d) => { setStaff(d.staff); if (!form.staffId && d.staff[0]) setForm((f) => ({ ...f, staffId: d.staff[0].id })) }).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (balStaff) call(`/api/hr/leave?balances=1&staffId=${balStaff}&year=${year}`).then((d) => setBalances(d.balances)).catch(() => setBalances([])) }, [balStaff, year])

  const review = async (id: string, action: string) => {
    const note = action === 'reject' ? window.prompt('Reason for rejecting (optional)') ?? '' : ''
    try { await call('/api/hr/leave', { method: 'PATCH', body: JSON.stringify({ id, action, note }) }); toast.success(`Request ${action}d`); load() } catch (e: any) { toast.error(e.message) }
  }
  const submit = async () => {
    try { await call('/api/hr/leave', { method: 'POST', body: JSON.stringify(form) }); toast.success('Leave recorded'); setForm({ ...form, reason: '' }); load() } catch (e: any) { toast.error(e.message) }
  }
  const badge = (s: string) => <Badge variant={s === 'APPROVED' ? 'default' : s === 'PENDING' ? 'secondary' : s === 'REJECTED' ? 'destructive' : 'outline'}>{s}</Badge>
  const Row = ({ r }: { r: LeaveRow }) => (
    <tr className="border-b">
      <td className="p-3"><p className="font-medium">{r.staffName}</p><p className="text-xs text-muted-foreground">{r.role}</p></td>
      <td className="p-3">{r.typeName}</td>
      <td className="p-3 text-xs">{fmt(r.startDate)} – {fmt(r.endDate)}<span className="block text-muted-foreground">{r.days} working day{r.days === 1 ? '' : 's'}</span></td>
      <td className="p-3 text-xs max-w-[220px]">{r.reason}{r.reviewNote ? <span className="block text-muted-foreground">Note: {r.reviewNote}</span> : null}</td>
      <td className="p-3">{badge(r.status)}</td>
      <td className="p-3">{r.status === 'PENDING' && <div className="flex gap-1"><Button size="sm" className="h-7 gap-1" onClick={() => review(r.id, 'approve')}><Check className="w-3 h-3" />Approve</Button><Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => review(r.id, 'reject')}><X className="w-3 h-3" />Reject</Button></div>}
        {r.status === 'APPROVED' && <Button size="sm" variant="ghost" className="h-7" onClick={() => review(r.id, 'cancel')}>Cancel</Button>}</td>
    </tr>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">Awaiting approval ({pendingTotal})</CardTitle><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" /></div></CardHeader>
          <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><tbody>{pending.map((r) => <Row key={r.id} r={r} />)}{pending.length === 0 && <tr><td className="p-6 text-center text-muted-foreground">Nothing waiting.</td></tr>}</tbody></table></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Record leave on behalf</CardTitle><CardDescription>Approved immediately by you after submission.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}><SelectTrigger><SelectValue placeholder="Staff" /></SelectTrigger><SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{config.leaveTypes.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent></Select>
            <div className="grid grid-cols-2 gap-2"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            <Textarea rows={2} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <Button size="sm" onClick={submit} disabled={!form.staffId || form.reason.length < 3}>Submit request</Button>
            <div className="pt-2 space-y-1">
              <Label className="text-xs">Balances for</Label>
              <Select value={balStaff} onValueChange={setBalStaff}><SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger><SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select>
              {balances.length > 0 && <table className="w-full text-xs mt-1"><tbody>{balances.map((b) => <tr key={b.key} className="border-b"><td className="py-1">{b.name}</td><td className="py-1 text-right font-mono">{b.taken}{b.entitlement ? ` / ${b.entitlement}` : ''}{b.pending ? ` (+${b.pending} pending)` : ''}</td></tr>)}</tbody></table>}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">All requests · {year}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Staff</th><th className="p-3">Type</th><th className="p-3">Dates</th><th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3" /></tr></thead><tbody>{rows.map((r) => <Row key={r.id} r={r} />)}{rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No requests this year.</td></tr>}</tbody></table><Paginator page={paging.page} pageSize={paging.pageSize} total={paging.total} onPage={setPage} className="border-t" /></CardContent>
      </Card>
    </div>
  )
}

// ─── Payroll ────────────────────────────────────────────────────────────────

function PayrollTab() {
  const [runs, setRuns] = useState<Run[]>([])
  const [period, setPeriod] = useState(thisMonth())
  const [open, setOpen] = useState<{ run: Run; payslips: Slip[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => call('/api/hr/payroll').then((d) => setRuns(d.runs)).catch((e) => toast.error(e.message)), [])
  useEffect(() => { load() }, [load])
  const openRun = async (id: string) => { try { const d = await call(`/api/hr/payroll/${id}`); setOpen({ run: { ...d.run, staffCount: d.payslips.length }, payslips: d.payslips }) } catch (e: any) { toast.error(e.message) } }
  const create = async () => { setBusy(true); try { const d = await call('/api/hr/payroll', { method: 'POST', body: JSON.stringify({ period }) }); toast.success(`Draft created for ${d.count} staff`); await load(); openRun(d.run.id) } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }
  const act = async (id: string, action: string) => {
    if (action === 'pay' && !window.confirm('Mark this payroll as paid? Payslips become visible to staff and figures are final.')) return
    setBusy(true); try { await call('/api/hr/payroll', { method: 'PATCH', body: JSON.stringify({ id, action }) }); toast.success(`Payroll ${action === 'pay' ? 'marked paid' : action + 'd'}`); await load(); openRun(id) } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const remove = async (id: string) => { if (!window.confirm('Delete this draft?')) return; try { await call(`/api/hr/payroll?id=${id}`, { method: 'DELETE' }); setOpen(null); load() } catch (e: any) { toast.error(e.message) } }
  const badge = (s: string) => <Badge variant={s === 'PAID' ? 'default' : s === 'APPROVED' ? 'secondary' : 'outline'}>{s}</Badge>

  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-end gap-2 p-4">
        <div className="space-y-1"><Label className="text-xs">New payroll for</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" /></div>
        <Button onClick={create} disabled={busy} className="gap-1"><Plus className="w-4 h-4" />Create draft</Button>
        <p className="text-xs text-muted-foreground basis-full">A draft computes every active staff member from basic salary and recurring items using the PAYE bands and NSSF rates in settings. Review, approve, then mark paid.</p>
      </CardContent></Card>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Period</th><th className="p-3">Status</th><th className="p-3 text-right">Staff</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">PAYE</th><th className="p-3 text-right">NSSF (both)</th><th className="p-3 text-right">Net pay</th><th className="p-3" /></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id} className="border-b cursor-pointer hover:bg-muted/40" onClick={() => openRun(r.id)}>
              <td className="p-3 font-medium">{r.label}</td><td className="p-3">{badge(r.status)}</td><td className="p-3 text-right font-mono">{r.staffCount}</td>
              <td className="p-3 text-right font-mono">{tzs(r.totalGross)}</td><td className="p-3 text-right font-mono">{tzs(r.totalPaye)}</td><td className="p-3 text-right font-mono">{tzs(r.totalNssfEmployee + r.totalNssfEmployer)}</td><td className="p-3 text-right font-mono font-semibold">{tzs(r.totalNet)}</td>
              <td className="p-3 text-right"><Button variant="ghost" size="sm">Open</Button></td>
            </tr>
          ))}{runs.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No payroll runs yet.</td></tr>}</tbody>
        </table>
      </CardContent></Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {open && (<>
            <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">Payroll · {open.run.label} {badge(open.run.status)}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-4 text-sm">
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Gross</p><p className="font-mono font-semibold">{tzs(open.run.totalGross)}</p></div>
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">PAYE to TRA</p><p className="font-mono font-semibold">{tzs(open.run.totalPaye)}</p></div>
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">NSSF to remit</p><p className="font-mono font-semibold">{tzs(open.run.totalNssfEmployee + open.run.totalNssfEmployer)}</p></div>
              <div className="rounded-lg bg-primary/10 p-3"><p className="text-xs text-muted-foreground">Net pay</p><p className="font-mono font-semibold">{tzs(open.run.totalNet)}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {open.run.status === 'DRAFT' && <><Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => act(open.run.id, 'recompute')}><RefreshCw className="w-4 h-4" />Recompute</Button><Button size="sm" disabled={busy} onClick={() => act(open.run.id, 'approve')}>Approve</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(open.run.id)}>Delete draft</Button></>}
              {open.run.status === 'APPROVED' && <><Button size="sm" disabled={busy} onClick={() => act(open.run.id, 'pay')}>Mark as paid</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => act(open.run.id, 'reopen')}>Reopen</Button></>}
              <span className="flex-1" />
              <Button size="sm" variant="outline" className="gap-1" onClick={() => download(`/api/hr/payroll/${open.run.id}?format=register`)}><FileDown className="w-4 h-4" />Register PDF</Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => download(`/api/hr/payroll/${open.run.id}?format=payslips`)}><FileDown className="w-4 h-4" />All payslips</Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => download(`/api/hr/payroll/${open.run.id}?format=bank`)}><FileDown className="w-4 h-4" />Bank CSV</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-2">Staff</th><th className="p-2 text-right">Basic</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">NSSF</th><th className="p-2 text-right">PAYE</th><th className="p-2 text-right">Other</th><th className="p-2 text-right">Net</th><th className="p-2">Bank</th><th className="p-2" /></tr></thead>
                <tbody>{open.payslips.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2"><p className="font-medium">{p.staffName}</p><p className="text-xs text-muted-foreground font-mono">{p.number}</p></td>
                    <td className="p-2 text-right font-mono">{tzs(p.basic)}</td><td className="p-2 text-right font-mono">{tzs(p.gross)}</td><td className="p-2 text-right font-mono">{tzs(p.nssfEmployee)}</td><td className="p-2 text-right font-mono">{tzs(p.paye)}</td><td className="p-2 text-right font-mono">{tzs(p.otherDeductions)}</td><td className="p-2 text-right font-mono font-semibold">{tzs(p.net)}</td>
                    <td className="p-2 text-xs">{p.bankName ? `${p.bankName} ${p.bankAccount ?? ''}` : <span className="text-amber-600">no bank</span>}</td>
                    <td className="p-2"><Button variant="ghost" size="icon-sm" title="Payslip PDF" onClick={() => download(`/api/hr/payroll/${open.run.id}?format=payslip&staffId=${p.staffId}`)}><FileDown className="w-4 h-4" /></Button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  )
}
