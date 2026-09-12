'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { AccountingConfig } from '@/lib/accounting/settings'

/** Settings → Accounting: fiscal year, automatic postings and which accounts they hit. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MAPPINGS: { key: keyof AccountingConfig['accounts']; label: string; types: string[] }[] = [
  { key: 'cash', label: 'Cash receipts go to', types: ['ASSET'] }, { key: 'bank', label: 'Bank transfers go to', types: ['ASSET'] }, { key: 'mobileMoney', label: 'M-Pesa / Tigo Pesa / Airtel Money go to', types: ['ASSET'] },
  { key: 'feesIncome', label: 'Fee income (default)', types: ['INCOME'] }, { key: 'feesReceivable', label: 'Fees receivable', types: ['ASSET'] },
  { key: 'salaries', label: 'Gross salaries', types: ['EXPENSE'] }, { key: 'employerNssf', label: 'Employer NSSF expense', types: ['EXPENSE'] }, { key: 'sdl', label: 'SDL expense', types: ['EXPENSE'] }, { key: 'wcf', label: 'WCF expense', types: ['EXPENSE'] },
  { key: 'payePayable', label: 'PAYE payable', types: ['LIABILITY'] }, { key: 'nssfPayable', label: 'NSSF payable', types: ['LIABILITY'] }, { key: 'sdlPayable', label: 'SDL payable', types: ['LIABILITY'] }, { key: 'wcfPayable', label: 'WCF payable', types: ['LIABILITY'] }, { key: 'staffDeductionsPayable', label: 'Staff deductions payable', types: ['LIABILITY'] },
  { key: 'payrollPaidFrom', label: 'Net salaries paid from', types: ['ASSET'] },
]

export function AccountingSettings({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<AccountingConfig | null>(null)
  const [accounts, setAccounts] = useState<{ code: string; name: string; type: string }[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    fetch('/api/settings/accounting').then((r) => r.json()).then((d) => setConfig(d.config)).catch(() => toast.error('Could not load accounting settings'))
    fetch('/api/accounting/accounts').then((r) => r.json()).then((d) => setAccounts(d.accounts ?? [])).catch(() => {})
  }, [])
  if (!config) return <div className="py-8 text-center text-muted-foreground">Loading…</div>
  const save = async (reset = false) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/accounting', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : { config }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      setConfig(d.config); toast.success(reset ? 'Accounting settings reset' : 'Accounting settings saved')
    } catch { toast.error('Something went wrong') } finally { setSaving(false) }
  }
  const AccountPick = ({ value, onChange, types }: { value: string; onChange: (v: string) => void; types: string[] }) => (
    <Select value={value} disabled={!canEdit} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{accounts.filter((a) => types.includes(a.type)).map((a) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select>
  )
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Fiscal year & automatic postings</CardTitle><CardDescription>Fee receipts and paid payroll runs post themselves to the ledger. Switch either off to post by hand.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1"><Label className="text-xs">Fiscal year starts in</Label>
            <Select value={String(config.fiscalYearStartMonth)} disabled={!canEdit} onValueChange={(v) => setConfig({ ...config, fiscalYearStartMonth: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>
          <label className="flex items-center gap-2 text-sm pt-5"><Switch checked={config.autoPostFees} disabled={!canEdit} onCheckedChange={(v) => setConfig({ ...config, autoPostFees: v })} />Post fee receipts automatically</label>
          <label className="flex items-center gap-2 text-sm pt-5"><Switch checked={config.autoPostPayroll} disabled={!canEdit} onCheckedChange={(v) => setConfig({ ...config, autoPostPayroll: v })} />Post payroll when marked paid</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Account mappings</CardTitle><CardDescription>Where each automatic posting lands. Rename accounts under Accounting → Accounts.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MAPPINGS.map((m) => <div key={m.key} className="space-y-1"><Label className="text-xs">{m.label}</Label><AccountPick value={config.accounts[m.key]} types={m.types} onChange={(v) => setConfig({ ...config, accounts: { ...config.accounts, [m.key]: v } })} /></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Fee income by fee name</CardTitle><CardDescription>A fee whose name contains the keyword posts to this income account instead of the default. First match wins.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {config.feeIncomeRules.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center">
              <Input value={r.keyword} disabled={!canEdit} placeholder="keyword, e.g. boarding" onChange={(e) => setConfig({ ...config, feeIncomeRules: config.feeIncomeRules.map((x, j) => (j === i ? { ...x, keyword: e.target.value } : x)) })} />
              <AccountPick value={r.code} types={['INCOME']} onChange={(v) => setConfig({ ...config, feeIncomeRules: config.feeIncomeRules.map((x, j) => (j === i ? { ...x, code: v } : x)) })} />
              <Button variant="ghost" size="icon-sm" disabled={!canEdit} onClick={() => setConfig({ ...config, feeIncomeRules: config.feeIncomeRules.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1" disabled={!canEdit || config.feeIncomeRules.length >= 20} onClick={() => setConfig({ ...config, feeIncomeRules: [...config.feeIncomeRules, { keyword: '', code: config.accounts.feesIncome }] })}><Plus className="w-4 h-4" />Add rule</Button>
        </CardContent>
      </Card>
      {canEdit && <div className="flex flex-wrap gap-2"><Button onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save accounting settings'}</Button><Button variant="outline" onClick={() => save(true)} disabled={saving} className="gap-1"><RotateCcw className="w-4 h-4" /> Reset to defaults</Button></div>}
    </div>
  )
}
