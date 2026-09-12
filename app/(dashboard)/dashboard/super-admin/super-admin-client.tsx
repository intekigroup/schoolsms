'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { School, Users, CreditCard, Plus, Settings2, Receipt, PlayCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Paginator, pageHref } from '@/components/ui/paginator'

interface Stats { schoolCount: number; userCount: number; activeSubscriptions: number }
interface SchoolItem {
  id: string; name: string; city: string; isActive: boolean;
  plan: string; status: string; students: number; staff: number; createdAt: string;
  monthlyAmount: number | null; pricingNotes: string;
}

const PLANS = ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']
const STATUSES = ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']

interface InvoiceItem {
  id: string; number: string; schoolName: string; plan: string
  amount: number; paid: number; outstanding: number; status: string
  periodStart: string; periodEnd: string; dueAt: string
}

export function SuperAdminClient({ stats, schools, invoices, saas = true, pageSize, schoolsPage, schoolsTotal, invoicesPage, invoicesTotal, outstanding }: {
  stats: Stats; schools: SchoolItem[]; invoices: InvoiceItem[]; saas?: boolean;
  pageSize: number; schoolsPage: number; schoolsTotal: number; invoicesPage: number; invoicesTotal: number; outstanding: number;
}) {
  const money = (n: number) => 'TZS ' + n.toLocaleString('en-GB')
  const params = useSearchParams()
  const goSchools = (p: number) => router.push(pageHref('/dashboard/super-admin', params.toString(), 'sp', p))
  const goInvoices = (p: number) => router.push(pageHref('/dashboard/super-admin', params.toString(), 'ip', p))
  const [cycleBusy, setCycleBusy] = useState(false)
  const [payFor, setPayFor] = useState<InvoiceItem | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER')
  const [payBusy, setPayBusy] = useState(false)

  const runCycle = async () => {
    setCycleBusy(true)
    try {
      const res = await fetch('/api/billing/run', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'The billing cycle failed'); return }
      toast.success(
        `${d.issued?.length ?? 0} invoice(s) issued · ${d.markedOverdue ?? 0} overdue · ${d.expired?.length ?? 0} expired`
      )
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setCycleBusy(false) }
  }

  const recordPayment = async () => {
    if (!payFor) return
    setPayBusy(true)
    try {
      const res = await fetch('/api/billing/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: payFor.id, amount: Math.round(Number(payAmount)), method: payMethod }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not record the payment'); return }
      toast.success(d.reactivated ? 'Paid — subscription reactivated' : 'Payment recorded')
      setPayFor(null); setPayAmount('')
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setPayBusy(false) }
  }

  const invoiceTone = (s: string) =>
    s === 'PAID' ? 'secondary' : s === 'OVERDUE' ? 'destructive' : s === 'VOID' ? 'outline' : 'default'

  const { t } = useI18n()
  const router = useRouter()

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', city: '', region: '', email: '', phone: '', plan: 'FREE' })

  const [manageSchool, setManageSchool] = useState<SchoolItem | null>(null)
  const [mPlan, setMPlan] = useState('FREE')
  const [mStatus, setMStatus] = useState('ACTIVE')
  const [mActive, setMActive] = useState(true)
  const [mAmount, setMAmount] = useState('')
  const [mNotes, setMNotes] = useState('')

  const planColor = (p: string) => {
    switch (p) {
      case 'ENTERPRISE': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
      case 'PREMIUM': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      case 'BASIC': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    }
  }
  const statusColor = (s: string) => {
    switch (s) {
      case 'ACTIVE': return 'default'
      case 'SUSPENDED': return 'destructive'
      case 'EXPIRED': return 'destructive'
      default: return 'secondary'
    }
  }

  const createSchool = async () => {
    if (!form.name.trim()) { toast.error('School name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      toast.success('School created')
      setCreateOpen(false)
      setForm({ name: '', city: '', region: '', email: '', phone: '', plan: 'FREE' })
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create school')
    } finally {
      setSaving(false)
    }
  }

  const openManage = (s: SchoolItem) => {
    setManageSchool(s)
    setMPlan(s.plan)
    setMStatus(s.status)
    setMActive(s.isActive)
    setMAmount(s.monthlyAmount ? String(s.monthlyAmount) : '')
    setMNotes(s.pricingNotes ?? '')
  }

  const saveManage = async () => {
    if (!manageSchool) return
    setSaving(true)
    try {
      const res = await fetch('/api/schools', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: manageSchool.id, plan: mPlan, status: mStatus, isActive: mActive,
          monthlyAmount: mAmount.trim() === '' ? null : Math.round(Number(mAmount)),
          pricingNotes: mNotes,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      toast.success('School updated')
      setManageSchool(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update school')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Super Admin Panel</h1>
            <p className="text-muted-foreground mt-1">Platform-wide management and school oversight.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New School</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register New School</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>School Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Serengeti High School" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Arusha" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Region</Label>
                    <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Arusha" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@school.tz" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+255..." />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Subscription Plan</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={createSchool} disabled={saving}>{saving ? 'Creating…' : 'Create School'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </FadeIn>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <School className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Schools</p>
                <p className="text-2xl font-bold font-mono">{stats?.schoolCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Users className="w-6 h-6 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold font-mono">{stats?.userCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Subscriptions</p>
                <p className="text-2xl font-bold font-mono">{stats?.activeSubscriptions ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>

      <Card>
        <CardHeader><CardTitle className="text-lg font-display">Registered Schools</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">School</th>
                <th className="text-left p-3 font-medium">City</th>
                <th className="text-left p-3 font-medium">Plan</th>
                <th className="text-left p-3 font-medium">Sub. Status</th>
                <th className="text-left p-3 font-medium">Students</th>
                <th className="text-left p-3 font-medium">Staff</th>
                <th className="text-left p-3 font-medium">Active</th>
                {saas && <th className="text-right p-3 font-medium">Monthly</th>}
                <th className="text-right p-3 font-medium">Manage</th>
              </tr></thead>
              <tbody>
                {(schools ?? []).map((s: SchoolItem) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3">{s.city || '-'}</td>
                    <td className="p-3"><span className={cn('text-xs px-2 py-1 rounded-full', planColor(s.plan))}>{s.plan}</span></td>
                    <td className="p-3"><Badge variant={statusColor(s.status) as any} className="text-xs">{s.status}</Badge></td>
                    <td className="p-3 font-mono">{s.students}</td>
                    <td className="p-3 font-mono">{s.staff}</td>
                    <td className="p-3">
                      <Badge variant={s.isActive ? 'default' : 'destructive'} className="text-xs">
                        {s.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    {saas && (<td className="p-3 text-right tabular-nums">
                      {s.monthlyAmount ? `TZS ${s.monthlyAmount.toLocaleString('en-GB')}` : <span className="text-xs text-muted-foreground">Not quoted</span>}
                    </td>)}
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openManage(s)}>
                        <Settings2 className="w-4 h-4" /> Manage
                      </Button>
                    </td>
                  </tr>
                ))}
                {(schools ?? []).length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No schools registered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Paginator page={schoolsPage} pageSize={pageSize} total={schoolsTotal} onPage={goSchools} className="border-t" />
        </CardContent>
      </Card>

      {/* Manage school dialog */}
      <Dialog open={!!manageSchool} onOpenChange={(o) => !o && setManageSchool(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage {manageSchool?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Subscription Plan</Label>
              <Select value={mPlan} onValueChange={setMPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subscription Status</Label>
              <Select value={mStatus} onValueChange={setMStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tenant Access</Label>
              <Select value={mActive ? 'active' : 'inactive'} onValueChange={(v) => setMActive(v === 'active')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (school can log in)</SelectItem>
                  <SelectItem value="inactive">Inactive (suspend access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agreed monthly amount (TZS)</Label>
              <Input type="number" min={0} step={1} value={mAmount} placeholder="Leave empty until a quote is agreed"
                onChange={(e: any) => setMAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Quoted from pupil numbers and level. Nothing is billed while this is empty.</p>
            </div>
            <div className="space-y-2">
              <Label>Quote basis</Label>
              <Input value={mNotes} placeholder="e.g. 620 pupils, primary + O-level" onChange={(e: any) => setMNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageSchool(null)}>Cancel</Button>
            <Button onClick={saveManage} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {saas && (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Receipt className="w-5 h-5" /> Subscription billing
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-display font-semibold tabular-nums">
                  {money(outstanding)}
                </p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={cycleBusy} onClick={runCycle}>
                {cycleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Run billing cycle
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesTotal === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No invoices yet. Run the billing cycle to raise them for active paid plans.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2 font-medium">Invoice</th>
                    <th className="p-2 font-medium">School</th>
                    <th className="p-2 font-medium">Period</th>
                    <th className="p-2 font-medium">Due</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium text-right">Outstanding</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{i.number}</td>
                      <td className="p-2">{i.schoolName}</td>
                      <td className="p-2 text-muted-foreground text-xs">{i.periodStart} → {i.periodEnd}</td>
                      <td className="p-2 text-muted-foreground text-xs">{i.dueAt}</td>
                      <td className="p-2 text-right tabular-nums">{money(i.amount)}</td>
                      <td className="p-2 text-right tabular-nums">{i.outstanding > 0 ? money(i.outstanding) : '—'}</td>
                      <td className="p-2"><Badge variant={invoiceTone(i.status) as any} className="text-xs">{i.status}</Badge></td>
                      <td className="p-2 text-right">
                        {i.outstanding > 0 && i.status !== 'VOID' && (
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => { setPayFor(i); setPayAmount(String(i.outstanding)) }}
                          >
                            Record payment
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginator page={invoicesPage} pageSize={pageSize} total={invoicesTotal} onPage={goInvoices} className="border-t" />
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={Boolean(payFor)} onOpenChange={(o: boolean) => { if (!o) setPayFor(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment for {payFor?.number}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              {payFor?.schoolName} · {money(payFor?.outstanding ?? 0)} outstanding
            </p>
            <div className="space-y-2">
              <Label>Amount received (TZS)</Label>
              <Input type="number" value={payAmount} onChange={(e: any) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  <SelectItem value="MPESA">M-Pesa</SelectItem>
                  <SelectItem value="TIGOPESA">Tigo Pesa</SelectItem>
                  <SelectItem value="AIRTEL_MONEY">Airtel Money</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Settling the balance in full reactivates a suspended or expired subscription.
            </p>
            <Button className="w-full" disabled={payBusy || !payAmount} onClick={recordPayment}>
              {payBusy ? 'Recording…' : 'Record payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
