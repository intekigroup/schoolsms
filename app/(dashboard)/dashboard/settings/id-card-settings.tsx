'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { IdCardConfig } from '@/lib/id-cards/settings'
import { IdCardPreview, type PreviewSchool } from '@/components/id-card-preview'

/** Settings → ID Cards: the design every card in the school is printed with, with a live preview. */

const PRESETS = [
  { name: 'Ocean', accent: '#0B6E93', secondary: '#1FA97A' },
  { name: 'Forest', accent: '#1B5E3A', secondary: '#C9A227' },
  { name: 'Maroon', accent: '#7A1E2B', secondary: '#D4A017' },
  { name: 'Navy', accent: '#1E2A5A', secondary: '#E0533D' },
  { name: 'Slate', accent: '#2F3B4A', secondary: '#4FB3BF' },
]

export function IdCardSettings({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<IdCardConfig | null>(null)
  const [school, setSchool] = useState<PreviewSchool>({ name: 'School' })
  const [saving, setSaving] = useState(false)
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [kind, setKind] = useState<'student' | 'staff'>('student')

  useEffect(() => {
    fetch('/api/settings/id-cards').then((r) => r.json()).then((d) => setConfig(d.config)).catch(() => toast.error('Could not load ID card design'))
    fetch('/api/settings').then((r) => r.json()).then(setSchool).catch(() => {})
  }, [])
  if (!config) return <div className="py-8 text-center text-muted-foreground">Loading…</div>

  const set = <K extends keyof IdCardConfig>(key: K, value: IdCardConfig[K]) => setConfig({ ...config, [key]: value })
  const save = async (reset = false) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/id-cards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : { config }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      setConfig(d.config)
      toast.success(reset ? 'ID card design reset' : 'ID card design saved')
    } catch { toast.error('Something went wrong') } finally { setSaving(false) }
  }

  const sample = kind === 'student'
    ? { kind: 'student' as const, name: 'Amina Juma Hassan', subtitle: config.student.showClass ? 'Form 2A' : null, photoUrl: null,
        fields: [
          ...(config.student.showAdmissionNo ? [['Admission no', 'KA-2026-042'] as [string, string]] : []),
          ...(config.student.showClass ? [['Class', 'Form 2A'] as [string, string]] : []),
          ...(config.student.showDateOfBirth ? [['Date of birth', '14 Mar 2011'] as [string, string]] : []),
          ...(config.student.showGender ? [['Gender', 'Female'] as [string, string]] : []),
          ...(config.student.showGuardianPhone ? [['Guardian', 'Juma Hassan · +255 754 000 000'] as [string, string]] : []),
        ], emergency: 'Juma Hassan · +255 754 000 000' }
    : { kind: 'staff' as const, name: 'Grace Mushi', subtitle: config.staff.showRole ? 'Mathematics teacher' : null, photoUrl: null,
        fields: [
          ...(config.staff.showEmployeeNo ? [['Employee no', 'EMP-014'] as [string, string]] : []),
          ...(config.staff.showRole ? [['Position', 'Mathematics teacher'] as [string, string]] : []),
          ...(config.staff.showPhone ? [['Phone', '+255 713 000 000'] as [string, string]] : []),
        ], emergency: null }

  const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 text-sm"><Switch checked={checked} disabled={!canEdit} onCheckedChange={onChange} />{label}</label>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Look</CardTitle><CardDescription>Colours and orientation apply to every card the school prints.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" disabled={!canEdit} onClick={() => set('theme', { ...config.theme, accent: p.accent, secondary: p.secondary })}
                  className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.accent }} /><span className="h-3 w-3 rounded-full" style={{ background: p.secondary }} />{p.name}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1"><Label className="text-xs">Accent</Label><Input type="color" value={config.theme.accent} disabled={!canEdit} onChange={(e) => set('theme', { ...config.theme, accent: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1"><Label className="text-xs">Stripe</Label><Input type="color" value={config.theme.secondary} disabled={!canEdit} onChange={(e) => set('theme', { ...config.theme, secondary: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1"><Label className="text-xs">Text on accent</Label><Input type="color" value={config.theme.onAccent} disabled={!canEdit} onChange={(e) => set('theme', { ...config.theme, onAccent: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1"><Label className="text-xs">Orientation</Label>
                <Select value={config.orientation} disabled={!canEdit} onValueChange={(v) => set('orientation', v as 'landscape' | 'portrait')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="landscape">Landscape</SelectItem><SelectItem value="portrait">Portrait</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <Toggle label="School logo (from the profile)" checked={config.showLogo} onChange={(v) => set('showLogo', v)} />
              <Toggle label="Motto under the name" checked={config.showMotto} onChange={(v) => set('showMotto', v)} />
              <Toggle label="QR code for verification" checked={config.qr.enabled} onChange={(v) => set('qr', { enabled: v })} />
              <Toggle label="Crop marks on A4 sheets" checked={config.sheet.cropMarks} onChange={(v) => set('sheet', { cropMarks: v })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pupil cards</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Title on the card</Label><Input value={config.student.title} maxLength={24} disabled={!canEdit} onChange={(e) => set('student', { ...config.student, title: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1"><Label className="text-xs">Valid until (free text)</Label><Input value={config.student.validUntil} maxLength={40} placeholder="e.g. Dec 2026" disabled={!canEdit} onChange={(e) => set('student', { ...config.student, validUntil: e.target.value })} /></div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle label="Admission number" checked={config.student.showAdmissionNo} onChange={(v) => set('student', { ...config.student, showAdmissionNo: v })} />
              <Toggle label="Class" checked={config.student.showClass} onChange={(v) => set('student', { ...config.student, showClass: v })} />
              <Toggle label="Date of birth" checked={config.student.showDateOfBirth} onChange={(v) => set('student', { ...config.student, showDateOfBirth: v })} />
              <Toggle label="Gender" checked={config.student.showGender} onChange={(v) => set('student', { ...config.student, showGender: v })} />
              <Toggle label="Guardian name & phone" checked={config.student.showGuardianPhone} onChange={(v) => set('student', { ...config.student, showGuardianPhone: v })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Staff cards</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Title on the card</Label><Input value={config.staff.title} maxLength={24} disabled={!canEdit} onChange={(e) => set('staff', { ...config.staff, title: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1"><Label className="text-xs">Valid until (free text)</Label><Input value={config.staff.validUntil} maxLength={40} placeholder="e.g. Dec 2026" disabled={!canEdit} onChange={(e) => set('staff', { ...config.staff, validUntil: e.target.value })} /></div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Toggle label="Employee number" checked={config.staff.showEmployeeNo} onChange={(v) => set('staff', { ...config.staff, showEmployeeNo: v })} />
              <Toggle label="Position" checked={config.staff.showRole} onChange={(v) => set('staff', { ...config.staff, showRole: v })} />
              <Toggle label="Phone" checked={config.staff.showPhone} onChange={(v) => set('staff', { ...config.staff, showPhone: v })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Back of the card</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-6">
              <Toggle label="Print a back side" checked={config.back.enabled} onChange={(v) => set('back', { ...config.back, enabled: v })} />
              <Toggle label="Emergency contact (pupils)" checked={config.back.showEmergencyContact} onChange={(v) => set('back', { ...config.back, showEmergencyContact: v })} />
              <Toggle label="Signature line" checked={config.back.showSignature} onChange={(v) => set('back', { ...config.back, showSignature: v })} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Conditions of use</Label><Textarea rows={3} value={config.back.note} maxLength={400} disabled={!canEdit} onChange={(e) => set('back', { ...config.back, note: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">If found, return to (blank = school address & phone)</Label><Input value={config.back.returnTo} maxLength={160} disabled={!canEdit} onChange={(e) => set('back', { ...config.back, returnTo: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Signature label</Label><Input value={config.back.signatureLabel} maxLength={40} disabled={!canEdit} onChange={(e) => set('back', { ...config.back, signatureLabel: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save ID card design'}</Button>
            <Button variant="outline" onClick={() => save(true)} disabled={saving} className="gap-1"><RotateCcw className="w-4 h-4" /> Reset to defaults</Button>
          </div>
        )}
      </div>

      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={kind === 'student' ? 'default' : 'outline'} onClick={() => setKind('student')}>Pupil</Button>
          <Button size="sm" variant={kind === 'staff' ? 'default' : 'outline'} onClick={() => setKind('staff')}>Staff</Button>
          <span className="flex-1" />
          <Button size="sm" variant={side === 'front' ? 'default' : 'outline'} onClick={() => setSide('front')}>Front</Button>
          <Button size="sm" variant={side === 'back' ? 'default' : 'outline'} onClick={() => setSide('back')} disabled={!config.back.enabled}>Back</Button>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-muted/40 p-4">
          <IdCardPreview config={config} school={school} holder={sample} side={side} scale={config.orientation === 'landscape' ? 1.05 : 0.95} />
        </div>
        <p className="text-xs text-muted-foreground">Preview is approximate; the PDF is exact. Cards print at CR80 (85.6 × 54 mm).</p>
      </div>
    </div>
  )
}
