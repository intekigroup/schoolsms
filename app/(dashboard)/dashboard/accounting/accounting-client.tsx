'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Settings2, Plus, FileDown, RefreshCw, Trash2, BookOpen, Receipt, ListTree, Target, BarChart3, Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { Paginator } from '@/components/ui/paginator'

/** Accounting console: overview, expenses, journal, chart of accounts, budgets, statements. */

interface Overview { cashAccounts: { code: string; name: string; balance: number }[]; cashTotal: number; monthIncome: number; monthExpenses: number; monthSurplus: number; debtorsTotal: number; debtors: number; fiscalYearStartMonth: number }
interface Acct { id: string; code: string; name: string; type: string; subtype: string | null; isSystem: boolean; active: boolean; balance?: number }

const tzs = (n: number) => `TSh ${Math.round(n).toLocaleString('en-GB')}`
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`
async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d?.error ?? 'Request failed')
  return d
}
const download = (href: string) => { const a = document.createElement('a'); a.href = href; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']

function useAccounts(withBalances = false) {
  const [accounts, setAccounts] = useState<Acct[]>([])
  const load = useCallback(() => call(`/api/accounting/accounts${withBalances ? '?balances=1' : ''}`).then((d) => setAccounts(d.accounts)).catch((e) => toast.error(e.message)), [withBalances])
  useEffect(() => { load() }, [load])
  return { accounts, reload: load }
}

export function AccountingClient({ overview, canConfigure }: { overview: Overview; canConfigure: boolean }) {
  const [ov, setOv] = useState(overview)
  const [syncing, setSyncing] = useState(false)
  const sync = async () => {
    setSyncing(true)
    try { const d = await call('/api/accounting/sync', { method: 'POST' }); toast.success(`Ledger synced: ${d.fees} receipt(s), ${d.payroll} payroll run(s) posted`); setOv(await call('/api/accounting/reports?type=overview')) } catch (e: any) { toast.error(e.message) } finally { setSyncing(false) }
  }
  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Accounting</h1>
            <p className="text-muted-foreground mt-1">Double-entry ledger fed by fee receipts and payroll, with expenses, budgets and statements.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={sync} disabled={syncing}><RefreshCw className="w-4 h-4" />{syncing ? 'Syncing…' : 'Sync fees & payroll'}</Button>
            {canConfigure && <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/dashboard/settings?tab=accounting"><Settings2 className="w-4 h-4" /> Settings</Link></Button>}
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{tzs(ov.cashTotal)}</p><p className="text-xs text-muted-foreground mt-1">Cash, bank & mobile money</p><p className="text-xs text-muted-foreground mt-1">{ov.cashAccounts.map((a) => `${a.name}: ${Math.round(a.balance).toLocaleString('en-GB')}`).join(' · ')}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{tzs(ov.monthIncome)}</p><p className="text-xs text-muted-foreground mt-1">Income this month</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{tzs(ov.monthExpenses)}</p><p className="text-xs text-muted-foreground mt-1">Expenses this month · {ov.monthSurplus >= 0 ? 'surplus' : 'deficit'} {tzs(Math.abs(ov.monthSurplus))}</p></CardContent></Card>
        <Card className={ov.debtorsTotal ? 'border-amber-400/60' : ''}><CardContent className="p-5"><p className="text-2xl font-bold font-mono">{tzs(ov.debtorsTotal)}</p><p className="text-xs text-muted-foreground mt-1">Fees outstanding from {ov.debtors} pupil(s)</p></CardContent></Card>
      </div>

      <Tabs defaultValue="expenses">
        <TabsList className="flex-wrap">
          <TabsTrigger value="expenses" className="gap-1.5"><Receipt className="w-4 h-4" />Expenses</TabsTrigger>
          <TabsTrigger value="journal" className="gap-1.5"><BookOpen className="w-4 h-4" />Journal</TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5"><ListTree className="w-4 h-4" />Accounts</TabsTrigger>
          <TabsTrigger value="budgets" className="gap-1.5"><Target className="w-4 h-4" />Budgets</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><BarChart3 className="w-4 h-4" />Statements</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses"><ExpensesTab /></TabsContent>
        <TabsContent value="journal"><JournalTab /></TabsContent>
        <TabsContent value="accounts"><AccountsTab /></TabsContent>
        <TabsContent value="budgets"><BudgetsTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Expenses ───────────────────────────────────────────────────────────────

function ExpensesTab() {
  const { accounts } = useAccounts()
  const [rows, setRows] = useState<any[]>([])
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, total: 0 })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: today(), payee: '', description: '', amount: '', accountId: '', paidFromId: '', reference: '' })
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => call(`/api/accounting/expenses?page=${page}`).then((d) => { setRows(d.expenses); setPaging({ page: d.page, pageSize: d.pageSize, total: d.total }) }).catch((e) => toast.error(e.message)), [page])
  useEffect(() => { load() }, [load])
  const expenseAccts = accounts.filter((a) => a.type === 'EXPENSE' && a.active)
  const cashAccts = accounts.filter((a) => ['CASH', 'BANK', 'MOBILE_MONEY'].includes(a.subtype ?? '') && a.active)
  useEffect(() => { if (!form.paidFromId && cashAccts[0]) setForm((f) => ({ ...f, paidFromId: cashAccts[0].id })) }, [cashAccts, form.paidFromId])
  const save = async () => {
    setSaving(true)
    try { await call('/api/accounting/expenses', { method: 'POST', body: JSON.stringify({ ...form, amount: Math.round(Number(form.amount)) }) }); toast.success('Expense recorded'); setOpen(false); setForm({ ...form, payee: '', description: '', amount: '', reference: '' }); load() } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const voidIt = async (id: string) => { const reason = window.prompt('Reason for voiding'); if (!reason) return; try { await call(`/api/accounting/expenses?id=${id}&reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }); load() } catch (e: any) { toast.error(e.message) } }
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-4 h-4" />Record expense</Button></div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-3">Date</th><th className="p-3">No</th><th className="p-3">Payee</th><th className="p-3">Description</th><th className="p-3">Account</th><th className="p-3">Paid from</th><th className="p-3 text-right">Amount</th><th className="p-3" /></tr></thead>
          <tbody>{rows.map((e) => {
            const voided = e.journalEntry?.status === 'VOID'
            return <tr key={e.id} className={`border-b ${voided ? 'opacity-50 line-through' : ''}`}>
              <td className="p-3 text-xs">{fmt(e.date)}</td><td className="p-3 font-mono text-xs">{e.number}</td><td className="p-3 font-medium">{e.payee}</td><td className="p-3 text-xs">{e.description}{e.reference ? <span className="block text-muted-foreground">Ref {e.reference}</span> : null}</td>
              <td className="p-3 text-xs">{e.account.code} {e.account.name}</td><td className="p-3 text-xs">{e.paidFromAcct.name}</td><td className="p-3 text-right font-mono">{tzs(e.amount)}</td>
              <td className="p-3">{!voided && <Button variant="ghost" size="icon-sm" title="Void" onClick={() => voidIt(e.id)}><Trash2 className="w-4 h-4" /></Button>}</td>
            </tr>
          })}{rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No expenses recorded yet.</td></tr>}</tbody>
        </table>
        <Paginator page={paging.page} pageSize={paging.pageSize} total={paging.total} onPage={setPage} className="border-t" />
      </CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record an expense</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Amount (TZS)</Label><Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Payee</Label><Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="e.g. TANESCO, Mwananchi Stationers" /></div>
            <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What it was for" /></div>
            <div className="space-y-1"><Label className="text-xs">Expense account</Label><Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{expenseAccts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Paid from</Label><Select value={form.paidFromId} onValueChange={(v) => setForm({ ...form, paidFromId: v })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{cashAccts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Reference (invoice / receipt no)</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          </div>
          <Button onClick={save} disabled={saving || !form.payee || !form.description || !form.amount || !form.accountId || !form.paidFromId}>{saving ? 'Saving…' : 'Record & post'}</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Journal ────────────────────────────────────────────────────────────────

function JournalTab() {
  const { accounts } = useAccounts()
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; entries: any[] }>({ total: 0, page: 1, pageSize: 50, entries: [] })
  const [from, setFrom] = useState(yearStart()), [to, setTo] = useState(today()), [source, setSource] = useState('ALL')
  const [page, setPage] = useState(1)
  // A new range or source starts again from the first page.
  useEffect(() => { setPage(1) }, [from, to, source])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: today(), memo: '', reference: '', lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }] })
  const load = useCallback(() => call(`/api/accounting/journal?from=${from}&to=${to}&page=${page}${source !== 'ALL' ? `&source=${source}` : ''}`).then(setData).catch((e) => toast.error(e.message)), [from, to, source, page])
  useEffect(() => { load() }, [load])
  const dr = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), cr = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const setLine = (i: number, patch: any) => setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const post = async () => {
    try {
      await call('/api/accounting/journal', { method: 'POST', body: JSON.stringify({ date: form.date, memo: form.memo, reference: form.reference || undefined, lines: form.lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debit: Math.round(Number(l.debit) || 0), credit: Math.round(Number(l.credit) || 0), description: l.description || undefined })) }) })
      toast.success('Entry posted'); setOpen(false); setForm({ date: today(), memo: '', reference: '', lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }] }); load()
    } catch (e: any) { toast.error(e.message) }
  }
  const voidIt = async (id: string) => { const reason = window.prompt('Reason for voiding'); if (!reason) return; try { await call('/api/accounting/journal', { method: 'PATCH', body: JSON.stringify({ id, action: 'void', reason }) }); load() } catch (e: any) { toast.error(e.message) } }
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-2 p-4">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Source</Label><Select value={source} onValueChange={setSource}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{['ALL', 'MANUAL', 'FEE', 'PAYROLL', 'EXPENSE', 'OPENING'].map((s) => <SelectItem key={s} value={s}>{s === 'ALL' ? 'All sources' : s}</SelectItem>)}</SelectContent></Select></div>
        <span className="flex-1" />
        <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-4 h-4" />Manual entry</Button>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">{data.total} entries</p>
      <div className="space-y-2">{data.entries.map((e) => (
        <Card key={e.id} className={e.status === 'VOID' ? 'opacity-60' : ''}><CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{e.number}</span><span className="text-xs text-muted-foreground">{fmt(e.date)}</span><Badge variant="outline">{e.source}</Badge>{e.status === 'VOID' && <Badge variant="destructive">VOID</Badge>}
            <span className="font-medium">{e.memo}</span>{e.reference && <span className="text-xs text-muted-foreground">Ref {e.reference}</span>}
            <span className="flex-1" />{e.status === 'POSTED' && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => voidIt(e.id)}>Void</Button>}
          </div>
          <table className="mt-2 w-full text-xs"><tbody>{e.lines.map((l: any) => (
            <tr key={l.id}><td className="py-0.5 pr-2 font-mono">{l.account.code}</td><td className="py-0.5 pr-2">{l.account.name}{l.description ? <span className="text-muted-foreground"> — {l.description}</span> : null}</td><td className="py-0.5 text-right font-mono w-28">{l.debit ? l.debit.toLocaleString('en-GB') : ''}</td><td className="py-0.5 text-right font-mono w-28">{l.credit ? l.credit.toLocaleString('en-GB') : ''}</td></tr>
          ))}</tbody></table>
          {e.voidReason && <p className="mt-1 text-xs text-muted-foreground">Void: {e.voidReason}</p>}
        </CardContent></Card>
      ))}{data.entries.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No entries in this range.</p>}</div>
      <Paginator page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Manual journal entry</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Memo</Label><Input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="e.g. Opening balances 1 Jan 2026 · Bank charges March" /></div>
          </div>
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_120px_120px_1fr_32px] gap-2 text-xs text-muted-foreground"><span>Account</span><span>Debit</span><span>Credit</span><span>Description</span><span /></div>
            {form.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_120px_120px_1fr_32px] gap-2 items-center">
                <Select value={l.accountId} onValueChange={(v) => setLine(i, { accountId: v })}><SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger><SelectContent>{accounts.filter((a) => a.active).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select>
                <Input type="number" min={0} placeholder="0" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                <Input type="number" min={0} placeholder="0" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                <Input placeholder="Optional" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <Button variant="ghost" size="icon-sm" disabled={form.lines.length <= 2} onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setForm({ ...form, lines: [...form.lines, { accountId: '', debit: '', credit: '', description: '' }] })}><Plus className="w-4 h-4" />Line</Button>
              <p className={`text-sm font-mono ${dr === cr ? 'text-emerald-600' : 'text-red-600'}`}>Dr {dr.toLocaleString('en-GB')} · Cr {cr.toLocaleString('en-GB')}{dr !== cr ? ` · out by ${Math.abs(dr - cr).toLocaleString('en-GB')}` : ' · balanced'}</p>
            </div>
          </div>
          <Button onClick={post} disabled={dr !== cr || dr === 0 || form.memo.length < 3}>Post entry</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Accounts ───────────────────────────────────────────────────────────────

function AccountsTab() {
  const { accounts, reload } = useAccounts(true)
  const [form, setForm] = useState({ code: '', name: '', type: 'EXPENSE', subtype: 'OPERATING' })
  const add = async () => { try { await call('/api/accounting/accounts', { method: 'POST', body: JSON.stringify(form) }); toast.success('Account added'); setForm({ ...form, code: '', name: '' }); reload() } catch (e: any) { toast.error(e.message) } }
  const rename = async (a: Acct) => { const name = window.prompt('New name', a.name); if (!name || name === a.name) return; try { await call('/api/accounting/accounts', { method: 'PATCH', body: JSON.stringify({ id: a.id, name }) }); reload() } catch (e: any) { toast.error(e.message) } }
  const toggle = async (a: Acct) => { try { await call('/api/accounting/accounts', { method: 'PATCH', body: JSON.stringify({ id: a.id, active: !a.active }) }); reload() } catch (e: any) { toast.error(e.message) } }
  return (
    <div className="space-y-3">
      <Card><CardContent className="grid gap-2 p-4 sm:grid-cols-[110px_1fr_140px_150px_auto] sm:items-end">
        <div className="space-y-1"><Label className="text-xs">Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, '') })} placeholder="5250" /></div>
        <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Security services" /></div>
        <div className="space-y-1"><Label className="text-xs">Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Group</Label><Input value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value.toUpperCase().replace(/[^A-Z_]/g, '') })} placeholder="OPERATING" /></div>
        <Button onClick={add} disabled={!form.code || !form.name} className="gap-1"><Plus className="w-4 h-4" />Add</Button>
      </CardContent></Card>
      {TYPES.map((t) => (
        <Card key={t}><CardHeader className="pb-1"><CardTitle className="text-sm">{t.charAt(0) + t.slice(1).toLowerCase()}</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><tbody>{accounts.filter((a) => a.type === t).map((a) => (
            <tr key={a.id} className={`border-b ${a.active ? '' : 'opacity-50'}`}>
              <td className="p-2 font-mono text-xs w-16">{a.code}</td><td className="p-2">{a.name}{a.isSystem && <Badge variant="outline" className="ml-2 text-[10px]">system</Badge>}</td><td className="p-2 text-xs text-muted-foreground">{a.subtype}</td>
              <td className="p-2 text-right font-mono">{tzs(a.balance ?? 0)}</td>
              <td className="p-2 text-right whitespace-nowrap"><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => rename(a)}>Rename</Button>{!a.isSystem && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggle(a)}>{a.active ? 'Close' : 'Reopen'}</Button>}</td>
            </tr>
          ))}</tbody></table>
        </CardContent></Card>
      ))}
    </div>
  )
}

// ─── Budgets ────────────────────────────────────────────────────────────────

function BudgetsTab() {
  const { accounts } = useAccounts()
  const [fy, setFy] = useState(new Date().getUTCFullYear())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [report, setReport] = useState<any>(null)
  const load = useCallback(async () => {
    try {
      const d = await call(`/api/accounting/budgets?fiscalYear=${fy}`)
      const m: Record<string, string> = {}; for (const b of d.budgets) m[b.accountId] = String(b.amount); setAmounts(m)
      setReport(await call(`/api/accounting/reports?type=budget&fiscalYear=${fy}`))
    } catch (e: any) { toast.error(e.message) }
  }, [fy])
  useEffect(() => { load() }, [load])
  const save = async () => { try { await call('/api/accounting/budgets', { method: 'PUT', body: JSON.stringify({ fiscalYear: fy, items: Object.entries(amounts).map(([accountId, v]) => ({ accountId, amount: Math.round(Number(v) || 0) })) }) }); toast.success('Budget saved'); load() } catch (e: any) { toast.error(e.message) } }
  const actual = (id: string) => report?.rows?.find((r: any) => r.id === id)
  const Section = ({ type }: { type: string }) => (
    <Card><CardHeader className="pb-1"><CardTitle className="text-sm">{type === 'INCOME' ? 'Income' : 'Expenses'}</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm"><thead><tr className="border-b bg-muted/50 text-left text-xs"><th className="p-2">Account</th><th className="p-2 text-right w-40">Budget (TZS)</th><th className="p-2 text-right">Actual</th><th className="p-2 text-right">Variance</th></tr></thead>
        <tbody>{accounts.filter((a) => a.type === type && a.active).map((a) => { const r = actual(a.id); return (
          <tr key={a.id} className="border-b"><td className="p-2"><span className="font-mono text-xs mr-2">{a.code}</span>{a.name}</td>
            <td className="p-2"><Input type="number" min={0} className="h-8 text-right" value={amounts[a.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [a.id]: e.target.value })} /></td>
            <td className="p-2 text-right font-mono">{r ? Math.round(r.actual).toLocaleString('en-GB') : '0'}</td>
            <td className={`p-2 text-right font-mono ${r && r.variance < 0 ? 'text-red-600' : ''}`}>{r ? Math.round(r.variance).toLocaleString('en-GB') : '—'}</td></tr>) })}</tbody></table>
    </CardContent></Card>
  )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label className="text-xs">Fiscal year</Label><Input type="number" className="w-28" value={fy} onChange={(e) => setFy(Number(e.target.value))} /></div>
        <Button onClick={save}>Save budget</Button>
        <Button variant="outline" className="gap-1.5" onClick={() => download(`/api/accounting/reports?type=budget&fiscalYear=${fy}&format=pdf`)}><FileDown className="w-4 h-4" />Budget vs actual PDF</Button>
      </div>
      <Section type="INCOME" /><Section type="EXPENSE" />
    </div>
  )
}

// ─── Statements ─────────────────────────────────────────────────────────────

function ReportsTab() {
  const { accounts } = useAccounts()
  const [from, setFrom] = useState(yearStart()), [to, setTo] = useState(today())
  const [accountId, setAccountId] = useState('')
  const [preview, setPreview] = useState<{ type: string; data: any } | null>(null)
  const cashAccts = useMemo(() => accounts.filter((a) => ['CASH', 'BANK', 'MOBILE_MONEY'].includes(a.subtype ?? '')), [accounts])
  useEffect(() => { if (!accountId && cashAccts[0]) setAccountId(cashAccts[0].id) }, [cashAccts, accountId])
  const q = (type: string) => `/api/accounting/reports?type=${type}&from=${from}&to=${to}&asAt=${to}${type === 'ledger' ? `&accountId=${accountId}` : ''}`
  const show = async (type: string) => { try { setPreview({ type, data: await call(q(type)) }) } catch (e: any) { toast.error(e.message) } }
  const REPORTS = [
    { type: 'income-statement', name: 'Income statement', desc: 'Income and expenses for the period, surplus or deficit.' },
    { type: 'balance-sheet', name: 'Balance sheet', desc: 'Assets, liabilities and equity as at the end date.' },
    { type: 'trial-balance', name: 'Trial balance', desc: 'Every account with a balance, debits against credits.' },
    { type: 'ledger', name: 'Cash book / account ledger', desc: 'Movements and running balance for one account.' },
    { type: 'debtors', name: 'Debtors ageing', desc: 'Outstanding fees per pupil in 30-day buckets.' },
  ]
  const n = (v: number) => Math.round(v).toLocaleString('en-GB')
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-2 p-4">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">To / as at</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Account (for the ledger)</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="w-64"><SelectValue placeholder="Account" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select></div>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{REPORTS.map((r) => (
        <Card key={r.type}><CardContent className="p-4 space-y-2">
          <div className="flex items-start gap-2"><Landmark className="w-5 h-5 text-primary mt-0.5" /><div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.desc}</p></div></div>
          <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => show(r.type)}>View</Button><Button size="sm" variant="outline" className="gap-1" onClick={() => download(`${q(r.type)}&format=pdf`)}><FileDown className="w-3 h-3" />PDF</Button><Button size="sm" variant="ghost" onClick={() => download(`${q(r.type)}&format=csv`)}>CSV</Button></div>
        </CardContent></Card>
      ))}</div>
      {preview && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">{REPORTS.find((r) => r.type === preview.type)?.name}</CardTitle></CardHeader><CardContent className="overflow-x-auto text-sm">
          {preview.type === 'income-statement' && <div className="space-y-2">
            {[['Income', preview.data.income], ['Expenses', preview.data.expenses]].map(([title, groups]: any) => <div key={title}><p className="font-semibold">{title}</p>{groups.map((g: any) => g.items.map((i: any) => <div key={i.id} className="flex justify-between"><span>{i.code} {i.name}</span><span className="font-mono">{n(i.balance)}</span></div>))}</div>)}
            <div className="flex justify-between border-t pt-2 font-semibold"><span>Total income</span><span className="font-mono">{n(preview.data.totalIncome)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total expenses</span><span className="font-mono">{n(preview.data.totalExpenses)}</span></div>
            <div className="flex justify-between border-t pt-2 font-bold text-primary"><span>{preview.data.surplus >= 0 ? 'Surplus' : 'Deficit'}</span><span className="font-mono">{n(preview.data.surplus)}</span></div>
          </div>}
          {preview.type === 'balance-sheet' && <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="font-semibold">Assets</p>{preview.data.assets.map((i: any) => <div key={i.id} className="flex justify-between"><span>{i.code} {i.name}</span><span className="font-mono">{n(i.balance)}</span></div>)}<div className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span className="font-mono">{n(preview.data.totalAssets)}</span></div></div>
            <div><p className="font-semibold">Liabilities</p>{preview.data.liabilities.map((i: any) => <div key={i.id} className="flex justify-between"><span>{i.code} {i.name}</span><span className="font-mono">{n(i.balance)}</span></div>)}<p className="font-semibold mt-2">Equity</p>{preview.data.equity.map((i: any) => <div key={i.id} className="flex justify-between"><span>{i.code} {i.name}</span><span className="font-mono">{n(i.balance)}</span></div>)}<div className="flex justify-between"><span>Surplus to date</span><span className="font-mono">{n(preview.data.surplus)}</span></div><div className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span className="font-mono">{n(preview.data.totalLiabilities + preview.data.totalEquity)}</span></div>{!preview.data.balanced && <p className="text-red-600 text-xs">Does not balance</p>}</div>
          </div>}
          {preview.type === 'trial-balance' && <table className="w-full"><tbody>{preview.data.rows.map((r: any) => <tr key={r.id} className="border-b"><td className="py-1 font-mono text-xs">{r.code}</td><td className="py-1">{r.name}</td><td className="py-1 text-right font-mono">{r.drBalance ? n(r.drBalance) : ''}</td><td className="py-1 text-right font-mono">{r.crBalance ? n(r.crBalance) : ''}</td></tr>)}<tr className="font-bold"><td /><td className="py-1">Totals</td><td className="py-1 text-right font-mono">{n(preview.data.totalDebit)}</td><td className="py-1 text-right font-mono">{n(preview.data.totalCredit)}</td></tr></tbody></table>}
          {preview.type === 'ledger' && <table className="w-full"><thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Entry</th><th>Memo</th><th className="text-right">Dr</th><th className="text-right">Cr</th><th className="text-right">Balance</th></tr></thead><tbody><tr><td colSpan={5} className="py-1">Opening balance</td><td className="py-1 text-right font-mono">{n(preview.data.openingBalance)}</td></tr>{preview.data.rows.map((r: any, i: number) => <tr key={i} className="border-b"><td className="py-1 text-xs">{fmt(r.date)}</td><td className="py-1 font-mono text-xs">{r.number}</td><td className="py-1 text-xs">{r.memo}</td><td className="py-1 text-right font-mono">{r.debit ? n(r.debit) : ''}</td><td className="py-1 text-right font-mono">{r.credit ? n(r.credit) : ''}</td><td className="py-1 text-right font-mono">{n(r.running)}</td></tr>)}<tr className="font-bold"><td colSpan={5} className="py-1">Closing balance</td><td className="py-1 text-right font-mono">{n(preview.data.closingBalance)}</td></tr></tbody></table>}
          {preview.type === 'debtors' && <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['Current', 'current'], ['31–60', 'd30'], ['61–90', 'd60'], ['90+', 'd90']].map(([l, k]) => <div key={k} className="rounded bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{l} days</p><p className="font-mono font-semibold">{n(preview.data.buckets[k])}</p></div>)}</div>
            <table className="w-full"><thead><tr className="text-left text-xs text-muted-foreground"><th>Pupil</th><th>Class</th><th>Guardian</th><th className="text-right">Days</th><th className="text-right">Balance</th></tr></thead><tbody>{preview.data.rows.map((r: any) => <tr key={r.studentId} className="border-b"><td className="py-1">{r.name} <span className="text-xs text-muted-foreground">{r.admissionNo}</span></td><td className="py-1 text-xs">{r.className}</td><td className="py-1 text-xs">{r.guardian ?? '—'}</td><td className="py-1 text-right font-mono">{r.days}</td><td className="py-1 text-right font-mono">{n(r.balance)}</td></tr>)}</tbody></table>
            <p className="font-bold text-right">Total outstanding: {n(preview.data.total)}</p>
          </div>}
        </CardContent></Card>
      )}
    </div>
  )
}
