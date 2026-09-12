'use client'

import { useI18n } from '@/lib/i18n-context'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BookMarked, CalendarRange, Plus, Pencil, Trash2, Star } from 'lucide-react'
import { toast } from 'sonner'

interface Subject {
  id: string; name: string; code: string; description: string
  classCount: number; examCount: number; slotCount: number
}
interface Term {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean; examCount: number
}
interface Year {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean
  examCount: number; terms: Term[]
}

const emptySubject = { id: '', name: '', code: '', description: '' }
const emptyYear = { id: '', name: '', startDate: '', endDate: '', isCurrent: false }
const emptyTerm = { id: '', academicYearId: '', name: '', startDate: '', endDate: '', isCurrent: false }

export function AcademicsClient({
  subjects,
  years,
  canWrite,
}: {
  subjects: Subject[]
  years: Year[]
  canWrite: boolean
}) {
  const { t: tt } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [subjectDialog, setSubjectDialog] = useState(false)
  const [subjectForm, setSubjectForm] = useState(emptySubject)
  const [yearDialog, setYearDialog] = useState(false)
  const [yearForm, setYearForm] = useState(emptyYear)
  const [termDialog, setTermDialog] = useState(false)
  const [termForm, setTermForm] = useState(emptyTerm)

  /** Shared submit: POST when the form has no id, PATCH when it does. */
  const submit = async (url: string, body: any, okMsg: string, close: () => void) => {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: body.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Failed to save'); return }
      toast.success(okMsg)
      close()
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusy(false) }
  }

  const remove = async (url: string, confirmMsg: string, okMsg: string) => {
    if (!window.confirm(confirmMsg)) return
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Failed to delete'); return }
      toast.success(okMsg)
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusy(false) }
  }

  const openSubject = (s?: Subject) =>
    { setSubjectForm(s ? { id: s.id, name: s.name, code: s.code, description: s.description } : emptySubject); setSubjectDialog(true) }
  const openYear = (y?: Year) =>
    { setYearForm(y ? { id: y.id, name: y.name, startDate: y.startDate, endDate: y.endDate, isCurrent: y.isCurrent } : emptyYear); setYearDialog(true) }
  const openTerm = (yearId: string, t?: Term) =>
    { setTermForm(t ? { id: t.id, academicYearId: yearId, name: t.name, startDate: t.startDate, endDate: t.endDate, isCurrent: t.isCurrent } : { ...emptyTerm, academicYearId: yearId }); setTermDialog(true) }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Academics</h1>
          <p className="text-muted-foreground mt-1">
            Subjects, academic years and terms — the records exams and timetables are built from.
          </p>
        </div>
      </FadeIn>

      <Tabs defaultValue="subjects">
        <TabsList>
          <TabsTrigger value="subjects" className="gap-2"><BookMarked className="w-4 h-4" /> Subjects</TabsTrigger>
          <TabsTrigger value="years" className="gap-2"><CalendarRange className="w-4 h-4" /> Years &amp; Terms</TabsTrigger>
        </TabsList>

        {/* ── Subjects ─────────────────────────────────────────── */}
        <TabsContent value="subjects" className="space-y-4 pt-4">
          {canWrite && (
            <div className="flex justify-end">
              <Button className="gap-2" onClick={() => openSubject()}><Plus className="w-4 h-4" /> Add Subject</Button>
            </div>
          )}

          {subjects.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No subjects yet. Exams and timetable slots need at least one.
            </CardContent></Card>
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => (
                <StaggerItem key={s.id}>
                  <Card>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{s.name}</p>
                          {s.code && <p className="text-xs text-muted-foreground mt-0.5">{s.code}</p>}
                        </div>
                        {canWrite && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openSubject(s)} aria-label={`Edit ${s.name}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" disabled={busy}
                              aria-label={`Delete ${s.name}`}
                              onClick={() => remove(`/api/subjects?id=${s.id}`, `Delete subject "${s.name}"?`, 'Subject deleted')}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="secondary">{s.classCount} class{s.classCount === 1 ? '' : 'es'}</Badge>
                        <Badge variant="secondary">{s.examCount} exam{s.examCount === 1 ? '' : 's'}</Badge>
                        <Badge variant="secondary">{s.slotCount} slot{s.slotCount === 1 ? '' : 's'}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>

        {/* ── Academic years & terms ───────────────────────────── */}
        <TabsContent value="years" className="space-y-4 pt-4">
          {canWrite && (
            <div className="flex justify-end">
              <Button className="gap-2" onClick={() => openYear()}><Plus className="w-4 h-4" /> Add Academic Year</Button>
            </div>
          )}

          {years.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No academic years yet. Exams cannot be created without one.
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {years.map((y) => (
                <Card key={y.id}>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{y.name}</p>
                          {y.isCurrent && (
                            <Badge className="gap-1"><Star className="w-3 h-3" /> Current</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {y.startDate} → {y.endDate} · {y.examCount} exam{y.examCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      {canWrite && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => openTerm(y.id)}>
                            <Plus className="w-3 h-3" /> Term
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openYear(y)} aria-label={`Edit ${y.name}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" disabled={busy}
                            aria-label={`Delete ${y.name}`}
                            onClick={() => remove(`/api/academic-years?id=${y.id}`, `Delete "${y.name}" and its terms?`, 'Academic year deleted')}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {y.terms.length === 0 ? (
                      <p className="text-sm text-muted-foreground border-t pt-3">{tt('academics.noTerms')}</p>
                    ) : (
                      <div className="border-t pt-3 space-y-2">
                        {y.terms.map((t) => (
                          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">{t.name}</span>
                              {t.isCurrent && <Badge variant="secondary" className="text-xs">{tt('academics.current')}</Badge>}
                              <span className="text-xs text-muted-foreground">
                                {t.startDate} → {t.endDate}
                                {t.examCount > 0 && ` · ${t.examCount} exam${t.examCount === 1 ? '' : 's'}`}
                              </span>
                            </div>
                            {canWrite && (
                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTerm(y.id, t)} aria-label={`Edit ${t.name}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7" disabled={busy}
                                  aria-label={`Delete ${t.name}`}
                                  onClick={() => remove(`/api/terms?id=${t.id}`, `Delete term "${t.name}"?`, 'Term deleted')}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Subject dialog ─────────────────────────────────────── */}
      <Dialog open={subjectDialog} onOpenChange={setSubjectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{subjectForm.id ? 'Edit Subject' : 'Add Subject'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{tt('common.name')}</Label>
              <Input value={subjectForm.name} placeholder="e.g. Mathematics"
                onChange={(e: any) => setSubjectForm({ ...subjectForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Code <span className="text-muted-foreground font-normal">(optional, unique)</span></Label>
              <Input value={subjectForm.code} placeholder="e.g. MATH"
                onChange={(e: any) => setSubjectForm({ ...subjectForm, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={subjectForm.description}
                onChange={(e: any) => setSubjectForm({ ...subjectForm, description: e.target.value })} />
            </div>
            <Button
              className="w-full" disabled={busy || !subjectForm.name.trim()}
              onClick={() => submit('/api/subjects', subjectForm, subjectForm.id ? 'Subject updated' : 'Subject created', () => setSubjectDialog(false))}
            >
              {busy ? 'Saving…' : subjectForm.id ? 'Save Changes' : 'Create Subject'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Academic year dialog ───────────────────────────────── */}
      <Dialog open={yearDialog} onOpenChange={setYearDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{yearForm.id ? 'Edit Academic Year' : 'Add Academic Year'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{tt('common.name')}</Label>
              <Input value={yearForm.name} placeholder="e.g. 2026"
                onChange={(e: any) => setYearForm({ ...yearForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tt('academics.startDate')}</Label>
                <Input type="date" value={yearForm.startDate}
                  onChange={(e: any) => setYearForm({ ...yearForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{tt('academics.endDate')}</Label>
                <Input type="date" value={yearForm.endDate}
                  onChange={(e: any) => setYearForm({ ...yearForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label className="cursor-pointer">{tt('academics.currentYear')}</Label>
                <p className="text-xs text-muted-foreground">{tt('academics.oneYear')}</p>
              </div>
              <Switch checked={yearForm.isCurrent}
                onCheckedChange={(v: boolean) => setYearForm({ ...yearForm, isCurrent: v })} />
            </div>
            <Button
              className="w-full"
              disabled={busy || !yearForm.name.trim() || !yearForm.startDate || !yearForm.endDate}
              onClick={() => submit('/api/academic-years', yearForm, yearForm.id ? 'Academic year updated' : 'Academic year created', () => setYearDialog(false))}
            >
              {busy ? 'Saving…' : yearForm.id ? 'Save Changes' : 'Create Year'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Term dialog ────────────────────────────────────────── */}
      <Dialog open={termDialog} onOpenChange={setTermDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{termForm.id ? 'Edit Term' : 'Add Term'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{tt('common.name')}</Label>
              <Input value={termForm.name} placeholder="e.g. Term 1"
                onChange={(e: any) => setTermForm({ ...termForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tt('academics.startDate')}</Label>
                <Input type="date" value={termForm.startDate}
                  onChange={(e: any) => setTermForm({ ...termForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{tt('academics.endDate')}</Label>
                <Input type="date" value={termForm.endDate}
                  onChange={(e: any) => setTermForm({ ...termForm, endDate: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">{tt('academics.termDates')}</p>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label className="cursor-pointer">{tt('academics.currentTerm')}</Label>
                <p className="text-xs text-muted-foreground">{tt('academics.oneTerm')}</p>
              </div>
              <Switch checked={termForm.isCurrent}
                onCheckedChange={(v: boolean) => setTermForm({ ...termForm, isCurrent: v })} />
            </div>
            <Button
              className="w-full"
              disabled={busy || !termForm.name.trim() || !termForm.startDate || !termForm.endDate}
              onClick={() => submit('/api/terms', termForm, termForm.id ? 'Term updated' : 'Term created', () => setTermDialog(false))}
            >
              {busy ? 'Saving…' : termForm.id ? 'Save Changes' : 'Create Term'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
