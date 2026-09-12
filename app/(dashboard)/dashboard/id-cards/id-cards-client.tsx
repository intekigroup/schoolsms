'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileDown, Printer, Camera, Trash2, Palette, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { IdCardConfig } from '@/lib/id-cards/settings'
import { IdCardPreview, type PreviewHolder, type PreviewSchool } from '@/components/id-card-preview'

interface Pupil { id: string; name: string; admissionNo: string; className: string | null; gender: string; dateOfBirth: string; photoUrl: string | null; guardian: string | null }
interface StaffRow { id: string; name: string; employeeNo: string; role: string; phone: string | null; photoUrl: string | null }

interface Props {
  config: IdCardConfig
  school: PreviewSchool
  classes: { id: string; name: string; count: number }[]
  staff: StaffRow[]
}

export function IdCardsClient({ config, school, classes, staff: initialStaff }: Props) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [pupils, setPupils] = useState<Pupil[]>([])
  const [loading, setLoading] = useState(false)
  const [staff, setStaff] = useState(initialStaff)
  const [selP, setSelP] = useState<Set<string>>(new Set())
  const [selS, setSelS] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [tab, setTab] = useState<'student' | 'staff'>('student')
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<{ kind: 'student' | 'staff'; id: string } | null>(null)

  useEffect(() => {
    if (!classId) return
    setLoading(true)
    fetch(`/api/id-cards/holders?classId=${classId}`).then((r) => r.json()).then((d) => { setPupils(d.students ?? []); setSelP(new Set()); setPreviewId(null) })
      .catch(() => toast.error('Could not load pupils')).finally(() => setLoading(false))
  }, [classId])

  const filteredStaff = useMemo(() => initialStaff.filter((s) => `${s.name} ${s.employeeNo} ${s.role}`.toLowerCase().includes(search.toLowerCase())).map((s) => staff.find((x) => x.id === s.id) ?? s), [initialStaff, staff, search])

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n) }
  const selectAll = (ids: string[], set: Set<string>, setter: (s: Set<string>) => void) => setter(set.size === ids.length ? new Set() : new Set(ids))

  const download = (params: string) => {
    const a = document.createElement('a')
    a.href = `/api/id-cards?${params}`
    a.download = ''
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }
  const downloadPupils = (layout: 'card' | 'sheet') => {
    if (selP.size === 0) download(`type=student&classId=${classId}&layout=${layout}`)
    else download(`type=student&ids=${[...selP].join(',')}&layout=${layout}`)
  }
  const downloadStaff = (layout: 'card' | 'sheet') => {
    if (selS.size === 0) download(`type=staff&all=1&layout=${layout}`)
    else download(`type=staff&ids=${[...selS].join(',')}&layout=${layout}`)
  }

  const pickPhoto = (kind: 'student' | 'staff', id: string) => { uploadTarget.current = { kind, id }; fileRef.current?.click() }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    const t = uploadTarget.current
    if (!file || !t) return
    const fd = new FormData(); fd.set('kind', t.kind); fd.set('id', t.id); fd.set('file', file)
    const res = await fetch('/api/photos', { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d?.error ?? 'Upload failed'); return }
    if (t.kind === 'student') setPupils((p) => p.map((x) => (x.id === t.id ? { ...x, photoUrl: d.photoUrl } : x)))
    else setStaff((p) => p.map((x) => (x.id === t.id ? { ...x, photoUrl: d.photoUrl } : x)))
    toast.success(`Photo saved (${Math.round(d.bytes / 1024)} KB)`)
  }
  const removePhoto = async (kind: 'student' | 'staff', id: string) => {
    const res = await fetch(`/api/photos?kind=${kind}&id=${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Could not remove photo'); return }
    if (kind === 'student') setPupils((p) => p.map((x) => (x.id === id ? { ...x, photoUrl: null } : x)))
    else setStaff((p) => p.map((x) => (x.id === id ? { ...x, photoUrl: null } : x)))
  }

  const holder: PreviewHolder | null = useMemo(() => {
    if (tab === 'student') {
      const p = pupils.find((x) => x.id === previewId) ?? pupils[0]
      if (!p) return null
      const s = config.student
      return {
        kind: 'student', name: p.name, subtitle: p.className, photoUrl: p.photoUrl, emergency: p.guardian,
        fields: [
          ...(s.showAdmissionNo ? [['Admission no', p.admissionNo] as [string, string]] : []),
          ...(s.showClass ? [['Class', p.className ?? 'Unassigned'] as [string, string]] : []),
          ...(s.showDateOfBirth ? [['Date of birth', p.dateOfBirth] as [string, string]] : []),
          ...(s.showGender ? [['Gender', p.gender] as [string, string]] : []),
          ...(s.showGuardianPhone && p.guardian ? [['Guardian', p.guardian] as [string, string]] : []),
        ],
      }
    }
    const p = staff.find((x) => x.id === previewId) ?? staff[0]
    if (!p) return null
    const s = config.staff
    return {
      kind: 'staff', name: p.name, subtitle: s.showRole ? p.role : null, photoUrl: p.photoUrl, emergency: null,
      fields: [
        ...(s.showEmployeeNo ? [['Employee no', p.employeeNo] as [string, string]] : []),
        ...(s.showRole ? [['Position', p.role] as [string, string]] : []),
        ...(s.showPhone && p.phone ? [['Phone', p.phone] as [string, string]] : []),
      ],
    }
  }, [tab, pupils, staff, previewId, config])

  const PhotoCell = ({ kind, id, photoUrl, name }: { kind: 'student' | 'staff'; id: string; photoUrl: string | null; name: string }) => (
    <div className="flex items-center gap-2">
      <div className="h-10 w-8 shrink-0 overflow-hidden rounded bg-muted">
        {photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-[10px] font-bold text-muted-foreground">{name.split(' ').slice(0, 2).map((w) => w[0]).join('')}</div>}
      </div>
      <Button variant="ghost" size="icon-sm" title="Upload photo" onClick={(e) => { e.stopPropagation(); pickPhoto(kind, id) }}><Camera className="w-4 h-4" /></Button>
      {photoUrl && <Button variant="ghost" size="icon-sm" title="Remove photo" onClick={(e) => { e.stopPropagation(); removePhoto(kind, id) }}><Trash2 className="w-4 h-4" /></Button>}
    </div>
  )

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">ID cards</h1>
            <p className="text-muted-foreground mt-1">Passport photos, a QR code that verifies the holder, CR80 cards or A4 sheets for the laminator.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/dashboard/settings?tab=idcards"><Palette className="w-4 h-4" /> Card design</Link></Button>
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'student' | 'staff'); setPreviewId(null) }}>
          <TabsList><TabsTrigger value="student">Pupils</TabsTrigger><TabsTrigger value="staff">Staff</TabsTrigger></TabsList>

          <TabsContent value="student" className="space-y-4">
            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
                    <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.count} pupils</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="gap-1.5" onClick={() => downloadPupils('card')} disabled={pupils.length === 0}><FileDown className="w-4 h-4" /> {selP.size ? `${selP.size} card${selP.size > 1 ? 's' : ''}` : 'Whole class'} (CR80)</Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => downloadPupils('sheet')} disabled={pupils.length === 0}><Printer className="w-4 h-4" /> A4 sheet</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50 text-left text-xs">
                    <th className="p-3 w-8"><Checkbox checked={pupils.length > 0 && selP.size === pupils.length} onCheckedChange={() => selectAll(pupils.map((p) => p.id), selP, setSelP)} /></th>
                    <th className="p-3">Photo</th><th className="p-3">Pupil</th><th className="p-3">Adm no</th><th className="p-3">Guardian</th>
                  </tr></thead>
                  <tbody>
                    {loading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
                    {!loading && pupils.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No active pupils in this class.</td></tr>}
                    {pupils.map((p) => (
                      <tr key={p.id} className={`border-b cursor-pointer ${previewId === p.id ? 'bg-primary/5' : 'hover:bg-muted/40'}`} onClick={() => setPreviewId(p.id)}>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}><Checkbox checked={selP.has(p.id)} onCheckedChange={() => toggle(selP, p.id, setSelP)} /></td>
                        <td className="p-3"><PhotoCell kind="student" id={p.id} photoUrl={p.photoUrl} name={p.name} /></td>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{p.admissionNo}</td>
                        <td className="p-3 text-xs text-muted-foreground">{p.guardian ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4">
            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Search</Label>
                  <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Name, number or position" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="gap-1.5" onClick={() => downloadStaff('card')} disabled={staff.length === 0}><FileDown className="w-4 h-4" /> {selS.size ? `${selS.size} card${selS.size > 1 ? 's' : ''}` : 'All staff'} (CR80)</Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => downloadStaff('sheet')} disabled={staff.length === 0}><Printer className="w-4 h-4" /> A4 sheet</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50 text-left text-xs">
                    <th className="p-3 w-8"><Checkbox checked={filteredStaff.length > 0 && selS.size === filteredStaff.length} onCheckedChange={() => selectAll(filteredStaff.map((s) => s.id), selS, setSelS)} /></th>
                    <th className="p-3">Photo</th><th className="p-3">Name</th><th className="p-3">Employee no</th><th className="p-3">Position</th>
                  </tr></thead>
                  <tbody>
                    {filteredStaff.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No active staff.</td></tr>}
                    {filteredStaff.map((s) => (
                      <tr key={s.id} className={`border-b cursor-pointer ${previewId === s.id ? 'bg-primary/5' : 'hover:bg-muted/40'}`} onClick={() => setPreviewId(s.id)}>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}><Checkbox checked={selS.has(s.id)} onCheckedChange={() => toggle(selS, s.id, setSelS)} /></td>
                        <td className="p-3"><PhotoCell kind="staff" id={s.id} photoUrl={s.photoUrl} name={s.name} /></td>
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{s.employeeNo}</td>
                        <td className="p-3 text-xs text-muted-foreground">{s.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display">Preview</CardTitle>
              <CardDescription>Click a row to preview. Photos are resized to a passport crop on upload.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={side === 'front' ? 'default' : 'outline'} onClick={() => setSide('front')}>Front</Button>
                <Button size="sm" variant={side === 'back' ? 'default' : 'outline'} onClick={() => setSide('back')} disabled={!config.back.enabled}>Back</Button>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-muted/40 p-3">
                {holder ? <IdCardPreview config={config} school={school} holder={holder} side={side} scale={config.orientation === 'landscape' ? 0.98 : 0.9} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
              </div>
              <p className="text-xs text-muted-foreground">CR80 · 85.6 × 54 mm. A4 sheets fit {config.orientation === 'landscape' ? 8 : 9} cards per page with the backs on the following page for duplex printing.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
