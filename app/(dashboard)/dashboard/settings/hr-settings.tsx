'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { HrConfig } from '@/lib/hr/settings'

/** Settings → HR & Payroll: leave types, working week, PAYE bands and statutory rates. */

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']] as const
const num = (v: string) => (v === '' ? 0 : Number(v))

export function HrSettings({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<HrConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetch('/api/settings/hr').then((r) => r.json()).then((d) => setConfig(d.config)).catch(() => toast.error('Could not load HR settings')) }, [])
  if (!config) return <div className="py-8 text-center text-muted-foreground">Loading…</div>

  const set = <K extends keyof HrConfig>(k: K, v: HrConfig[K]) => setConfig({ ...config, [k]: v })
  const setPay = <K extends keyof HrConfig['payroll']>(k: K, v: HrConfig['payroll'][K]) => set('payroll', { ...config.payroll, [k]: v })
  const setLeave = (i: number, patch: Partial<HrConfig['leaveTypes'][number]>) => set('leaveTypes', config.leaveTypes.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const setBracket = (i: number, patch: Partial<HrConfig['payroll']['payeBrackets'][number]>) => setPay('payeBrackets', config.payroll.payeBrackets.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  const save = async (reset = false) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/hr', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : { config }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      setConfig(d.config)
      toast.success(reset ? 'HR settings reset to Tanzanian defaults' : 'HR settings saved')
    } catch { toast.error('Something went wrong') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Leave types</CardTitle><CardDescription>Entitlement is working days per calendar year; 0 means no fixed cap (granted as approved). Defaults follow the Employment and Labour Relations Act.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden sm:grid grid-cols-[140px_1fr_110px_80px_40px] gap-2 text-xs text-muted-foreground"><span>Key</span><span>Name</span><span>Days / year</span><span>Paid</span><span /></div>
          {config.leaveTypes.map((t, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[140px_1fr_110px_80px_40px] gap-2 items-center">
              <Input value={t.key} disabled={!canEdit} onChange={(e) => setLeave(i, { key: e.target.value.toUpperCase().replace(/[^A-Z_]/g, '') })} className="font-mono text-xs" />
              <Input value={t.name} disabled={!canEdit} maxLength={40} onChange={(e) => setLeave(i, { name: e.target.value })} />
              <Input type="number" min={0} max={366} value={t.daysPerYear} disabled={!canEdit} onChange={(e) => setLeave(i, { daysPerYear: num(e.target.value) })} />
              <label className="flex items-center gap-2 text-sm"><Switch checked={t.paid} disabled={!canEdit} onCheckedChange={(v) => setLeave(i, { paid: v })} /></label>
              <Button variant="ghost" size="icon-sm" disabled={!canEdit || config.leaveTypes.length <= 1} onClick={() => set('leaveTypes', config.leaveTypes.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1" disabled={!canEdit || config.leaveTypes.length >= 12} onClick={() => set('leaveTypes', [...config.leaveTypes, { key: 'OTHER', name: 'Other leave', daysPerYear: 0, paid: true }])}><Plus className="w-4 h-4" /> Add leave type</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Working week</CardTitle><CardDescription>Leave is counted in working days; weekends and non-working days are skipped.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {DAYS.map(([d, label]) => {
            const on = config.workingDays.includes(d)
            return <Button key={d} size="sm" variant={on ? 'default' : 'outline'} disabled={!canEdit} onClick={() => set('workingDays', on ? config.workingDays.filter((x) => x !== d) : [...config.workingDays, d])}>{label}</Button>
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>PAYE bands (monthly)</CardTitle><CardDescription>Marginal rate on taxable pay above the previous band. Taxable pay is basic plus taxable allowances less the employee&apos;s NSSF contribution. Leave the last band&apos;s ceiling blank.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden sm:grid grid-cols-[200px_120px_40px] gap-2 text-xs text-muted-foreground"><span>Up to (TZS)</span><span>Rate %</span><span /></div>
          {config.payroll.payeBrackets.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_40px] sm:grid-cols-[200px_120px_40px] gap-2 items-center">
              <Input type="number" min={1} placeholder="No ceiling" value={b.upTo ?? ''} disabled={!canEdit} onChange={(e) => setBracket(i, { upTo: e.target.value === '' ? null : num(e.target.value) })} />
              <Input type="number" min={0} max={100} step={0.5} value={b.rate} disabled={!canEdit} onChange={(e) => setBracket(i, { rate: Number(e.target.value) })} />
              <Button variant="ghost" size="icon-sm" disabled={!canEdit || config.payroll.payeBrackets.length <= 1} onClick={() => setPay('payeBrackets', config.payroll.payeBrackets.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1" disabled={!canEdit || config.payroll.payeBrackets.length >= 8} onClick={() => setPay('payeBrackets', [...config.payroll.payeBrackets, { upTo: null, rate: 30 }])}><Plus className="w-4 h-4" /> Add band</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Statutory contributions</CardTitle><CardDescription>NSSF is split between employee and employer. SDL and WCF are employer costs on gross payroll and never reduce net pay.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label className="text-xs">NSSF employee %</Label><Input type="number" min={0} max={50} step={0.5} value={config.payroll.nssfEmployeeRate} disabled={!canEdit} onChange={(e) => setPay('nssfEmployeeRate', Number(e.target.value))} /></div>
          <div className="space-y-1"><Label className="text-xs">NSSF employer %</Label><Input type="number" min={0} max={50} step={0.5} value={config.payroll.nssfEmployerRate} disabled={!canEdit} onChange={(e) => setPay('nssfEmployerRate', Number(e.target.value))} /></div>
          <div className="space-y-1"><Label className="text-xs">Pay day (day of month)</Label><Input type="number" min={1} max={31} value={config.payroll.payDay} disabled={!canEdit} onChange={(e) => setPay('payDay', num(e.target.value))} /></div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm"><Switch checked={config.payroll.sdlEnabled} disabled={!canEdit} onCheckedChange={(v) => setPay('sdlEnabled', v)} />Skills Development Levy</label>
            <Input type="number" min={0} max={20} step={0.5} value={config.payroll.sdlRate} disabled={!canEdit || !config.payroll.sdlEnabled} onChange={(e) => setPay('sdlRate', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm"><Switch checked={config.payroll.wcfEnabled} disabled={!canEdit} onCheckedChange={(v) => setPay('wcfEnabled', v)} />Workers Compensation Fund</label>
            <Input type="number" min={0} max={20} step={0.1} value={config.payroll.wcfRate} disabled={!canEdit || !config.payroll.wcfEnabled} onChange={(e) => setPay('wcfRate', Number(e.target.value))} />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label className="text-xs">Note on every payslip</Label><Input value={config.payroll.payslipNote} maxLength={200} disabled={!canEdit} onChange={(e) => setPay('payslipNote', e.target.value)} /></div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save HR settings'}</Button>
          <Button variant="outline" onClick={() => save(true)} disabled={saving} className="gap-1"><RotateCcw className="w-4 h-4" /> Reset to defaults</Button>
        </div>
      )}
    </div>
  )
}
