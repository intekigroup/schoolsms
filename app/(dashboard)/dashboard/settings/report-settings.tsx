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
import type { ReportConfig } from '@/lib/reports/settings'

/**
 * Settings → Reports. Everything the report engine reads is edited here:
 * grade scale, how assessments combine, divisions, ranking, which documents
 * the school prints, and how a report card is laid out.
 */

const EXAM_TYPES: { key: keyof ReportConfig['weights']; label: string }[] = [
  { key: 'CAT', label: 'Continuous assessment (CAT)' },
  { key: 'MIDTERM', label: 'Mid-term' },
  { key: 'END_OF_TERM', label: 'End of term' },
  { key: 'MOCK', label: 'Mock' },
  { key: 'NECTA_MOCK', label: 'NECTA mock' },
  { key: 'NECTA', label: 'NECTA' },
]

const DOCUMENTS: { key: keyof ReportConfig['reports']; label: string; hint: string }[] = [
  { key: 'reportCard', label: 'Report cards', hint: 'One page per pupil, for parents. Also used by the pupil portal.' },
  { key: 'classSheet', label: 'Class results sheet', hint: 'Every pupil and subject on one landscape sheet, with positions.' },
  { key: 'subjectAnalysis', label: 'Subject analysis', hint: 'Mean, highest, lowest and grade counts per subject.' },
  { key: 'performanceSummary', label: 'Performance summary', hint: 'Class averages, grade and division distribution, top ten.' },
]

const CARD_OPTIONS: { key: keyof Omit<ReportConfig['card'], 'footerNote'>; label: string }[] = [
  { key: 'showPosition', label: 'Class position' },
  { key: 'showSubjectPosition', label: 'Position in each subject' },
  { key: 'showClassAverage', label: 'Class average' },
  { key: 'showPoints', label: 'Points per subject' },
  { key: 'showAttendance', label: 'Attendance for the term' },
  { key: 'showRemarks', label: 'Teacher remarks' },
  { key: 'showConduct', label: 'Conduct' },
  { key: 'showSignatures', label: 'Signature lines' },
  { key: 'autoRemarks', label: 'Auto remark when none is written' },
]

const num = (v: string) => (v === '' ? 0 : Number(v))

export function ReportSettings({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<ReportConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/reports').then((r) => r.json()).then((d) => setConfig(d.config)).catch(() => toast.error('Could not load report settings'))
  }, [])

  if (!config) return <div className="py-8 text-center text-muted-foreground">Loading…</div>

  const set = <K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => setConfig({ ...config, [key]: value })
  const setScale = (i: number, patch: Partial<ReportConfig['scale'][number]>) =>
    set('scale', config.scale.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const setBand = (i: number, patch: Partial<ReportConfig['division']['bands'][number]>) =>
    set('division', { ...config.division, bands: config.division.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

  const save = async (reset = false) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/reports', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { reset: true } : { config }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      setConfig(d.config)
      toast.success(reset ? 'Report settings reset to Tanzanian defaults' : 'Report settings saved')
    } catch { toast.error('Something went wrong') } finally { setSaving(false) }
  }

  const weightTotal = Object.values(config.weights).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Grade scale</CardTitle>
          <CardDescription>Bands are applied highest first; the last band always starts at 0. Points follow NECTA (A = 1 … F = 5) and feed the division.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden sm:grid grid-cols-[70px_110px_90px_1fr_40px] gap-2 text-xs text-muted-foreground">
            <span>Grade</span><span>From %</span><span>Points</span><span>Remark</span><span />
          </div>
          {config.scale.map((b, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[70px_110px_90px_1fr_40px] gap-2 items-center">
              <Input value={b.grade} maxLength={3} disabled={!canEdit} onChange={(e) => setScale(i, { grade: e.target.value.toUpperCase() })} className="font-bold" />
              <Input type="number" min={0} max={100} value={b.min} disabled={!canEdit} onChange={(e) => setScale(i, { min: num(e.target.value) })} />
              <Input type="number" min={1} max={9} value={b.points} disabled={!canEdit} onChange={(e) => setScale(i, { points: num(e.target.value) })} />
              <Input value={b.remark} maxLength={40} disabled={!canEdit} onChange={(e) => setScale(i, { remark: e.target.value })} />
              <Button variant="ghost" size="icon-sm" disabled={!canEdit || config.scale.length <= 2} onClick={() => set('scale', config.scale.filter((_, j) => j !== i))} title="Remove band">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={!canEdit || config.scale.length >= 10} onClick={() => set('scale', [...config.scale, { grade: '', min: 0, points: config.scale.length + 1, remark: '' }])} className="gap-1">
            <Plus className="w-4 h-4" /> Add band
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How assessments combine</CardTitle>
          <CardDescription>
            Weight of each assessment type in a subject&apos;s term mark. Types not sat in a term are dropped and the rest re-scaled,
            so a subject with only an end-of-term exam counts it in full.
            {weightTotal !== 100 && <span className="block mt-1 text-amber-600 dark:text-amber-400">Weights add up to {weightTotal}% — they are re-scaled to 100%, but 100 reads more clearly.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXAM_TYPES.map((t) => (
            <div key={t.key} className="space-y-1">
              <Label className="text-xs">{t.label}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={100} value={config.weights[t.key]} disabled={!canEdit}
                  onChange={(e) => set('weights', { ...config.weights, [t.key]: num(e.target.value) })} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Divisions (O-level)</CardTitle>
          <CardDescription>CSEE-style division from the points of the pupil&apos;s best subjects. Applies to O-level classes only; beyond the last band is Division 0.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={config.division.enabled} disabled={!canEdit} onCheckedChange={(v) => set('division', { ...config.division, enabled: v })} />
              Compute divisions
            </label>
            <div className="flex items-center gap-2 text-sm">
              <Label className="text-xs">Best</Label>
              <Input type="number" min={1} max={15} className="w-20" value={config.division.bestOf} disabled={!canEdit}
                onChange={(e) => set('division', { ...config.division, bestOf: num(e.target.value) })} />
              <span className="text-muted-foreground">subjects</span>
            </div>
          </div>
          {config.division.enabled && (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[110px_140px_40px] gap-2 text-xs text-muted-foreground"><span>Division</span><span>Up to points</span><span /></div>
              {config.division.bands.map((b, i) => (
                <div key={i} className="grid grid-cols-[110px_140px_40px] gap-2 items-center">
                  <Input value={b.name} maxLength={4} disabled={!canEdit} onChange={(e) => setBand(i, { name: e.target.value.toUpperCase() })} className="font-bold" />
                  <Input type="number" min={1} max={99} value={b.maxPoints} disabled={!canEdit} onChange={(e) => setBand(i, { maxPoints: num(e.target.value) })} />
                  <Button variant="ghost" size="icon-sm" disabled={!canEdit || config.division.bands.length <= 1} onClick={() => set('division', { ...config.division, bands: config.division.bands.filter((_, j) => j !== i) })}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" disabled={!canEdit || config.division.bands.length >= 8} className="gap-1"
                onClick={() => set('division', { ...config.division, bands: [...config.division.bands, { name: '', maxPoints: (config.division.bands[config.division.bands.length - 1]?.maxPoints ?? 0) + 4 }] })}>
                <Plus className="w-4 h-4" /> Add division
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking</CardTitle>
          <CardDescription>Positions use dense ranking — pupils with the same score share a position.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={config.ranking.enabled} disabled={!canEdit} onCheckedChange={(v) => set('ranking', { ...config.ranking, enabled: v })} />
            Rank pupils
          </label>
          <div className="flex items-center gap-2 text-sm">
            <Label className="text-xs">Rank by</Label>
            <Select value={config.ranking.by} disabled={!canEdit} onValueChange={(v) => set('ranking', { ...config.ranking, by: v as 'average' | 'total' })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="average">Average mark</SelectItem>
                <SelectItem value="total">Total marks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents the school produces</CardTitle>
          <CardDescription>A document switched off here cannot be generated from the Results page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {DOCUMENTS.map((d) => (
            <label key={d.key} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <Switch checked={config.reports[d.key]} disabled={!canEdit} onCheckedChange={(v) => set('reports', { ...config.reports, [d.key]: v })} />
              <span><span className="font-medium">{d.label}</span><span className="block text-xs text-muted-foreground">{d.hint}</span></span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report card layout</CardTitle>
          <CardDescription>What is printed on each pupil&apos;s card.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CARD_OPTIONS.map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-sm">
                <Switch checked={config.card[o.key]} disabled={!canEdit} onCheckedChange={(v) => set('card', { ...config.card, [o.key]: v })} />
                {o.label}
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Footer note</Label>
            <Input value={config.card.footerNote} maxLength={160} disabled={!canEdit} placeholder="e.g. Next term begins on Monday 12 January 2027. Fees are due before opening day."
              onChange={(e) => set('card', { ...config.card, footerNote: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save report settings'}</Button>
          <Button variant="outline" onClick={() => save(true)} disabled={saving} className="gap-1"><RotateCcw className="w-4 h-4" /> Reset to defaults</Button>
        </div>
      )}
    </div>
  )
}
