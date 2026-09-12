'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { TZ_REGIONS, SCHOOL_TYPES } from '@/lib/tz'
import { cn } from '@/lib/utils'
import { addressLine } from '@/lib/letterhead'
import { ImagePlus, Trash2, Building2, Phone, MapPin, Settings2 } from 'lucide-react'

/**
 * Settings → School profile. Everything that prints on the letterhead of a
 * report card, receipt, payslip or ID card, in the order a head teacher would
 * fill a school form: identity, contact, location, then preferences.
 */
const LEVELS = [
  { value: 'NURSERY', label: 'Nursery' }, { value: 'PRIMARY', label: 'Primary (Std 1–7)' },
  { value: 'O_LEVEL', label: 'O-level (Form 1–4)' }, { value: 'A_LEVEL', label: 'A-level (Form 5–6)' },
]
type Profile = {
  name: string; shortName: string; motto: string; schoolType: string; schoolLevel: string[]; registrationNo: string
  email: string; phone: string; website: string
  address: string; poBox: string; district: string; region: string
  approxPupils: string; preferredLocale: string; logoUrl: string | null
}
const EMPTY: Profile = { name: '', shortName: '', motto: '', schoolType: '', schoolLevel: [], registrationNo: '', email: '', phone: '', website: '', address: '', poBox: '', district: '', region: '', approxPupils: '', preferredLocale: 'en', logoUrl: null }

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <div className={cn('space-y-1.5', className)}><Label className="text-xs">{label}</Label>{children}{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>
}
function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return <div className="space-y-3"><p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</p>{children}</div>
}

export function SchoolProfile({ canEdit }: { canEdit: boolean }) {
  const [p, setP] = useState<Profile>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const set = (k: keyof Profile, v: any) => setP((x) => ({ ...x, [k]: v }))
  const load = (d: any) => setP({ ...EMPTY, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? (k === 'schoolLevel' ? [] : k === 'logoUrl' ? null : '')])), approxPupils: d.approxPupils ? String(d.approxPupils) : '', schoolLevel: d.schoolLevel ?? [] })

  useEffect(() => { fetch('/api/settings').then((r) => r.json()).then(load).catch(() => {}).finally(() => setLoading(false)) }, [])

  const save = async () => {
    setSaving(true)
    try {
      const body = { ...p, approxPupils: p.approxPupils ? Number(p.approxPupils) : null, schoolType: p.schoolType || null, logoUrl: undefined }
      const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Could not save'); return }
      load(d); toast.success('School profile saved')
    } finally { setSaving(false) }
  }
  const uploadLogo = async (f: File | undefined) => {
    if (!f) return
    setLogoBusy(true)
    try {
      const fd = new FormData(); fd.set('kind', 'logo'); fd.set('file', f)
      const r = await fetch('/api/photos', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Upload failed'); return }
      set('logoUrl', d.photoUrl); toast.success('Logo updated — it now prints on every document')
    } finally { setLogoBusy(false); if (file.current) file.current.value = '' }
  }
  const removeLogo = async () => {
    setLogoBusy(true)
    try { const r = await fetch('/api/photos?kind=logo', { method: 'DELETE' }); if (r.ok) { set('logoUrl', null); toast.success('Logo removed') } } finally { setLogoBusy(false) }
  }

  if (loading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>
  const ro = !canEdit
  return (
    <Card>
      <CardHeader><CardTitle>School Profile</CardTitle><p className="text-sm text-muted-foreground">These details print on report cards, receipts, payslips, ID cards and SMS. Keep them exactly as the school is registered.</p></CardHeader>
      <CardContent className="space-y-8">
        <Section icon={Building2} title="Identity">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex w-36 shrink-0 flex-col items-center gap-2">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                {p.logoUrl ? <img src={p.logoUrl} alt="School logo" className="h-full w-full object-contain p-1" /> : <span className="px-2 text-center text-[11px] text-muted-foreground">No logo yet</span>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="gap-1" disabled={logoBusy} onClick={() => file.current?.click()}><ImagePlus className="h-3.5 w-3.5" /> {p.logoUrl ? 'Replace' : 'Upload'}</Button>
                  {p.logoUrl && <Button size="sm" variant="ghost" disabled={logoBusy} onClick={removeLogo}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
                </div>
              )}
              <p className="text-center text-[11px] text-muted-foreground">PNG or JPEG, square works best</p>
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Field label="School name"><Input value={p.name} disabled={ro} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Short name" hint="Used as the SMS sender name and on receipts (max 20)"><Input value={p.shortName} maxLength={20} disabled={ro} onChange={(e) => set('shortName', e.target.value)} placeholder="e.g. KILIACAD" /></Field>
              <Field label="Motto" hint="Printed under the school name on documents" className="sm:col-span-2"><Input value={p.motto} maxLength={160} disabled={ro} onChange={(e) => set('motto', e.target.value)} /></Field>
              <Field label="Type of school"><Select value={p.schoolType} onValueChange={(v) => set('schoolType', v)} disabled={ro}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{SCHOOL_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.en}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Registration number" hint="As issued by the Ministry / TAMISEMI, e.g. S.1234 or EM.1234"><Input value={p.registrationNo} maxLength={40} disabled={ro} onChange={(e) => set('registrationNo', e.target.value)} /></Field>
              <Field label="Levels taught" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">{LEVELS.map((l) => { const on = p.schoolLevel.includes(l.value); return <button key={l.value} type="button" disabled={ro} onClick={() => set('schoolLevel', on ? p.schoolLevel.filter((x) => x !== l.value) : [...p.schoolLevel, l.value])} className={cn('rounded-full border px-3 py-1 text-sm disabled:opacity-60', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>{l.label}</button> })}</div>
              </Field>
            </div>
          </div>
        </Section>

        <Section icon={Phone} title="Contact">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Phone" hint="Printed on documents and used as the reply number in SMS"><Input value={p.phone} disabled={ro} onChange={(e) => set('phone', e.target.value)} placeholder="0745 389 941" /></Field>
            <Field label="Email"><Input type="email" value={p.email} disabled={ro} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Website"><Input value={p.website} disabled={ro} onChange={(e) => set('website', e.target.value)} placeholder="www.school.ac.tz" /></Field>
          </div>
        </Section>

        <Section icon={MapPin} title="Location">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="P.O. Box" hint="Number and town, e.g. 1234 Moshi"><Input value={p.poBox} disabled={ro} onChange={(e) => set('poBox', e.target.value)} placeholder="1234 Moshi" /></Field>
            <Field label="Region"><Select value={p.region} onValueChange={(v) => set('region', v)} disabled={ro}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{TZ_REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="District / town"><Input value={p.district} disabled={ro} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Moshi" /></Field>
            <Field label="Street / ward / village" className="sm:col-span-3"><Input value={p.address} disabled={ro} onChange={(e) => set('address', e.target.value)} placeholder="e.g. Rau ward, along Arusha road" /></Field>
          </div>
          <p className="text-xs text-muted-foreground">Letterhead preview: <span className="font-medium text-foreground">{addressLine(p) || '—'}</span></p>
        </Section>

        <Section icon={Settings2} title="Preferences">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Language for SMS and portals"><Select value={p.preferredLocale} onValueChange={(v) => set('preferredLocale', v)} disabled={ro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="sw">Kiswahili</SelectItem></SelectContent></Select></Field>
            <Field label="Approximate number of pupils" hint="Helps us size your plan"><Input type="number" min={0} value={p.approxPupils} disabled={ro} onChange={(e) => set('approxPupils', e.target.value)} /></Field>
          </div>
        </Section>

        {canEdit && <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>}
      </CardContent>
    </Card>
  )
}
