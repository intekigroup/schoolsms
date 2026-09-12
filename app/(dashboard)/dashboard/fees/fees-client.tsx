'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FadeIn } from '@/components/ui/animate'
import { DollarSign, CreditCard, TrendingUp, AlertCircle, Plus, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Paginator, pageHref } from '@/components/ui/paginator'

interface FeeStructure { id: string; name: string; amount: number; className: string; paymentCount: number; discountable?: boolean }
interface Payment { id: string; student: string; amount: number; method: string; status: string; fee: string; date: string; receiptNo: string }
interface Student { id: string; name: string; admissionNo: string }
interface ClassOpt { id: string; name: string }

function formatTZS(n: number) { return `TZS ${(n ?? 0).toLocaleString('en-US')}` }

const methodIcons: Record<string, string> = { CASH: '💵', MPESA: '📱', TIGOPESA: '📱', AIRTEL_MONEY: '📱', BANK_TRANSFER: '🏦' }

export function FeesClient({ structures, payments, totalCollected, totalPending, students, classes, page, pageSize, paymentsTotal, feeSettings, canEdit = true }: {
  structures: FeeStructure[]; payments: Payment[]; totalCollected: number; totalPending: number; feeSettings?: { siblingSecondPct: number; siblingThirdPct: number }; canEdit?: boolean;
  students: Student[]; classes: ClassOpt[]; page: number; pageSize: number; paymentsTotal: number;
}) {
  const { t } = useI18n()
  const router = useRouter()
  const go = (p: number) => router.push(pageHref('/dashboard/fees', '', 'page', p))

  const toggleDiscountable = async (f: FeeStructure) => {
    const r = await fetch('/api/fees', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, discountable: !(f.discountable !== false) }) })
    if (!r.ok) { toast.error('Could not update'); return }
    toast.success(`${f.name}: sibling discount ${f.discountable !== false ? 'excluded' : 'applies'}`); router.refresh()
  }
  const [payOpen, setPayOpen] = useState(false)
  const [structOpen, setStructOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [pay, setPay] = useState({ studentId: '', feeStructureId: '', amount: '', paymentMethod: 'CASH', paymentStatus: 'COMPLETED', transactionRef: '', remarks: '' })
  const [struct, setStruct] = useState({ name: '', amount: '', classId: 'ALL', description: '' })

  const handleStructureSelect = (id: string) => {
    const f = structures.find((s) => s.id === id)
    setPay((p) => ({ ...p, feeStructureId: id, amount: f ? String(f.amount) : p.amount }))
  }

  const recordPayment = async () => {
    if (!pay.studentId || !pay.feeStructureId || !pay.amount) { toast.error('Please fill student, fee and amount'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/fees/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pay) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed to record payment'); return }
      toast.success(`Payment recorded — Receipt ${d.receiptNo}`)
      setPayOpen(false)
      setPay({ studentId: '', feeStructureId: '', amount: '', paymentMethod: 'CASH', paymentStatus: 'COMPLETED', transactionRef: '', remarks: '' })
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  const addStructure = async () => {
    if (!struct.name || !struct.amount) { toast.error('Please fill name and amount'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(struct) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed to add fee structure'); return }
      toast.success('Fee structure added')
      setStructOpen(false)
      setStruct({ name: '', amount: '', classId: 'ALL', description: '' })
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.fees')}</h1>
            <p className="text-muted-foreground mt-1">Manage fee structures, payments, and receipts.</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={structOpen} onOpenChange={setStructOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Fee Structure</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Fee Structure</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label>Fee Type</Label>
                    <Input value={struct.name} onChange={(e: any) => setStruct({ ...struct, name: e.target.value })} placeholder="e.g. Tuition — Term 1" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount (TZS)</Label>
                      <Input type="number" value={struct.amount} onChange={(e: any) => setStruct({ ...struct, amount: e.target.value })} placeholder="500000" />
                    </div>
                    <div className="space-y-2">
                      <Label>Class</Label>
                      <Select value={struct.classId} onValueChange={(v: string) => setStruct({ ...struct, classId: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Classes</SelectItem>
                          {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Input value={struct.description} onChange={(e: any) => setStruct({ ...struct, description: e.target.value })} />
                  </div>
                  <Button onClick={addStructure} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Add Fee Structure'}</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={payOpen} onOpenChange={setPayOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Receipt className="w-4 h-4" /> Record Payment</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Fee Payment</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label>Student</Label>
                    <Select value={pay.studentId} onValueChange={(v: string) => setPay({ ...pay, studentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>
                        {(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fee Type</Label>
                    <Select value={pay.feeStructureId} onValueChange={handleStructureSelect}>
                      <SelectTrigger><SelectValue placeholder="Select fee" /></SelectTrigger>
                      <SelectContent>
                        {(structures ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {formatTZS(f.amount)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount (TZS)</Label>
                      <Input type="number" value={pay.amount} onChange={(e: any) => setPay({ ...pay, amount: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Method</Label>
                      <Select value={pay.paymentMethod} onValueChange={(v: string) => setPay({ ...pay, paymentMethod: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="MPESA">M-Pesa</SelectItem>
                          <SelectItem value="TIGOPESA">Tigo Pesa</SelectItem>
                          <SelectItem value="AIRTEL_MONEY">Airtel Money</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={pay.paymentStatus} onValueChange={(v: string) => setPay({ ...pay, paymentStatus: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="PENDING">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Txn Ref (optional)</Label>
                      <Input value={pay.transactionRef} onChange={(e: any) => setPay({ ...pay, transactionRef: e.target.value })} placeholder="e.g. QGH7X..." />
                    </div>
                  </div>
                  <Button onClick={recordPayment} disabled={loading} className="w-full">{loading ? 'Recording...' : 'Record Payment'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Total Collected</p>
                <p className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{formatTZS(totalCollected)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-800 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-300" /></div>
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400">Pending</p>
                <p className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300">{formatTZS(totalPending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Fee Structures</p>
                <p className="text-xl font-bold font-mono">{structures?.length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><CreditCard className="w-5 h-5 text-amber-700 dark:text-amber-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Payments</p>
                <p className="text-xl font-bold font-mono">{paymentsTotal}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SiblingDiscountCard initial={feeSettings ?? { siblingSecondPct: 0, siblingThirdPct: 0 }} canEdit={canEdit} />

      <Card>
        <CardHeader><CardTitle className="text-lg font-display">Fee Structures</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Fee Type</th>
                <th className="text-left p-3 font-medium">Class</th>
                <th className="text-left p-3 font-medium">Amount</th>
                <th className="text-left p-3 font-medium">Payments</th>
                <th className="text-left p-3 font-medium">Sibling discount</th>
              </tr></thead>
              <tbody>
                {(structures ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No fee structures yet. Click "Fee Structure" to add one.</td></tr>
                ) : (structures ?? []).map((f: FeeStructure) => (
                  <tr key={f.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{f.name}</td>
                    <td className="p-3">{f.className}</td>
                    <td className="p-3 font-mono">{formatTZS(f.amount)}</td>
                    <td className="p-3"><Badge variant="secondary">{f.paymentCount}</Badge></td>
                    <td className="p-3"><button type="button" disabled={!canEdit} onClick={() => toggleDiscountable(f)} className={`rounded-full border px-2 py-0.5 text-xs ${f.discountable !== false ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground'}`} title={canEdit ? 'Click to change' : undefined}>{f.discountable !== false ? 'Applies' : 'Excluded'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg font-display">Recent Payments</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Receipt</th>
                <th className="text-left p-3 font-medium">Student</th>
                <th className="text-left p-3 font-medium">Fee</th>
                <th className="text-left p-3 font-medium">Amount</th>
                <th className="text-left p-3 font-medium">Method</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {(payments ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No payments yet</td></tr>
                ) : (payments ?? []).map((p: Payment) => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs"><a href={`/api/fees/receipt?paymentId=${p.id}`} target="_blank" rel="noopener" className="text-primary hover:underline" title="Print receipt">{p.receiptNo || 'Receipt'}</a></td>
                    <td className="p-3 font-medium">{p.student}</td>
                    <td className="p-3">{p.fee}</td>
                    <td className="p-3 font-mono">{formatTZS(p.amount)}</td>
                    <td className="p-3">{methodIcons[p.method] ?? ''} {p.method?.replace('_', ' ')}</td>
                    <td className="p-3"><Badge variant={p.status === 'COMPLETED' ? 'default' : 'secondary'} className="text-xs">{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator page={page} pageSize={pageSize} total={paymentsTotal} onPage={go} className="border-t" />
        </CardContent>
      </Card>
    </div>
  )
}


/** The school's sibling discount policy: percent off discountable fees for the 2nd child and the 3rd+ child of one family (eldest first). */
function SiblingDiscountCard({ initial, canEdit }: { initial: { siblingSecondPct: number; siblingThirdPct: number }; canEdit: boolean }) {
  const [v, setV] = useState({ second: String(initial.siblingSecondPct), third: String(initial.siblingThirdPct) })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/fees/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siblingSecondPct: Number(v.second) || 0, siblingThirdPct: Number(v.third) || 0 }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Could not save'); return }
      toast.success('Sibling discount saved — statements, invoices and balances now use it')
    } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg font-display">Sibling discount</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Pupils who share a guardian are a family. The eldest pays in full; younger siblings get a percentage off every fee marked "Applies" below. Pupils see the discount on their statement, invoice and receipts.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>2nd child (%)</Label><Input type="number" min={0} max={100} value={v.second} disabled={!canEdit} onChange={(e: any) => setV({ ...v, second: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>3rd child and later (%)</Label><Input type="number" min={0} max={100} value={v.third} disabled={!canEdit} onChange={(e: any) => setV({ ...v, third: e.target.value })} /></div>
          {canEdit && <div className="flex items-end"><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save discount'}</Button></div>}
        </div>
      </CardContent>
    </Card>
  )
}
