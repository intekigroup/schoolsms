'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatMoney } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/animate'
import { Heart, Users, CalendarCheck, DollarSign, GraduationCap, Phone, Mail, User as UserIcon, KeyRound, Copy, Plus, Pencil, Trash2, Link2, X, FileDown, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

type Grade = { id: string; exam: string; subject: string; marks: number; totalMarks: number; grade: string }
type ChildTerm = { id: string; name: string }
type ChildPayment = { id: string; paidAt: string; receiptNo: string | null; fee: string; method: string; amount: number }
type ChildSlot = { id: string; dayOfWeek: number; startTime: string; endTime: string; room: string; subject: string; teacher: string }
type Child = {
  classId?: string | null
  schoolId?: string
  schoolName?: string
  terms?: ChildTerm[]
  payments?: ChildPayment[]
  discount?: number
  discountPct?: number
  familyRank?: number
  familySize?: number
  timetable?: ChildSlot[]
  id: string
  name: string
  admissionNo: string
  className: string
  photoUrl: string | null
  attendancePct: number | null
  attendanceTotal: number
  dueTotal: number
  paid: number
  balance: number
  grades: Grade[]
}
type Guardian = {
  id: string
  name: string
  phone: string
  email: string | null
  relationship: string | null
  linked: boolean
  children: { id: string; name: string; className: string; isPrimary: boolean }[]
  address: string
  occupation: string
}
type StudentOption = { id: string; name: string; admissionNo: string }
type Announcement = { id: string; title: string; content: string; isPublic: boolean; createdAt: string; schoolName?: string | null }

// Locale-aware, matching the rest of the app.
const fmtTZS = (n: number, locale = 'en') => formatMoney(n, locale)

const gradeColor = (g: string) => {
  switch (g) {
    case 'A': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'B': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'C': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'D': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    default: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  }
}

interface HomeworkItem { id: string; kind: string; title: string; description: string; className: string; subjectName: string | null; teacher: string | null; dueDate: string | null; createdAt: string }

export function ParentsClient({
  childrenData,
  directory,
  studentOptions,
  isStaffView,
  announcements,
  homework = [],
  manySchools = false,
  familySchools = [],
}: {
  childrenData: Child[]
  directory: Guardian[]
  studentOptions: StudentOption[]
  isStaffView: boolean
  announcements: Announcement[]
  homework?: HomeworkItem[]
  manySchools?: boolean
  familySchools?: { id: string; name: string; children: number }[]
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  // Readable exactly once, for the office to hand over.
  const [newLogin, setNewLogin] = useState<{ name: string; email: string; password: string } | null>(null)

  const createLogin = async (g: Guardian) => {
    setBusyId(g.id)
    try {
      const res = await fetch('/api/guardians/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardianId: g.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not create the login'); return }
      setNewLogin({ name: g.name, email: d.email, password: d.password })
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusyId(null) }
  }

  const emptyForm = { id: '', firstName: '', lastName: '', phone: '', email: '', relationship: '', address: '', occupation: '', studentId: '', isPrimary: false }
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [linkFor, setLinkFor] = useState<Guardian | null>(null)
  const [linkStudentId, setLinkStudentId] = useState('')

  const openAdd = () => { setForm(emptyForm); setFormOpen(true) }
  const openEdit = (g: Guardian) => {
    const [firstName, ...rest] = g.name.split(' ')
    setForm({
      id: g.id, firstName, lastName: rest.join(' '), phone: g.phone, email: g.email ?? '',
      relationship: g.relationship ?? '', address: g.address, occupation: g.occupation,
      studentId: '', isPrimary: false,
    })
    setFormOpen(true)
  }

  const saveGuardian = async () => {
    setBusyId('form')
    try {
      const editing = Boolean(form.id)
      const res = await fetch('/api/guardians', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...form, studentId: undefined } : form),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      toast.success(editing ? 'Guardian updated' : 'Guardian added')
      setFormOpen(false)
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusyId(null) }
  }

  const deleteGuardian = async (g: Guardian) => {
    if (!window.confirm(`Delete ${g.name}? Their link to every pupil is removed.`)) return
    setBusyId(g.id)
    try {
      const res = await fetch(`/api/guardians?id=${g.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not delete'); return }
      toast.success('Guardian deleted')
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusyId(null) }
  }

  const linkChild = async () => {
    if (!linkFor || !linkStudentId) return
    setBusyId(linkFor.id)
    try {
      const res = await fetch('/api/guardians/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardianId: linkFor.id, studentId: linkStudentId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not link'); return }
      toast.success('Linked')
      setLinkFor(null); setLinkStudentId('')
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusyId(null) }
  }

  const unlinkChild = async (g: Guardian, childId: string, childName: string) => {
    if (!window.confirm(`Unlink ${g.name} from ${childName}?`)) return
    setBusyId(g.id)
    try {
      const res = await fetch(`/api/guardians/link?guardianId=${g.id}&studentId=${childId}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not unlink'); return }
      toast.success('Unlinked')
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusyId(null) }
  }

  const removeLogin = async (g: Guardian) => {
    if (!window.confirm(`Remove the portal login for ${g.name}? They will be signed out and cannot sign in again.`)) return
    setBusyId(g.id)
    try {
      const res = await fetch(`/api/guardians/account?guardianId=${g.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not remove the login'); return }
      toast.success('Login removed')
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.parents')}</h1>
          <p className="text-muted-foreground mt-1">
            {isStaffView
              ? t('parent.staffSubtitle')
              : t('parent.subtitle')}
          </p>
        </div>
      </FadeIn>

      {/* PARENT VIEW: child cards */}
      {!isStaffView && childrenData.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {childrenData.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{c.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{c.className} · {c.admissionNo}{manySchools && c.schoolName ? <> · <span className="font-medium text-foreground">{c.schoolName}</span></> : null}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Attendance */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <CalendarCheck className="w-4 h-4 text-green-600" /> {t('parent.attendance')}
                    </span>
                    <span className="text-sm font-semibold">
                      {c.attendancePct === null ? t('common.noRecords') : `${c.attendancePct}%`}
                    </span>
                  </div>
                  {c.attendancePct !== null && <Progress value={c.attendancePct} className="h-2" />}
                  {c.attendanceTotal > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{t('parent.daysRecorded', { n: c.attendanceTotal })}</p>
                  )}
                </div>

                {/* Fees */}
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-600" /> {t('parent.fees')}
                    </span>
                    <Badge variant={c.balance > 0 ? 'destructive' : 'secondary'} className="text-xs">
                      {c.balance > 0 ? `${fmtTZS(c.balance)} ${t('common.due')}` : t('common.cleared')}
                    </Badge>
                  </div>
                  {(c.discount ?? 0) > 0 && <p className="mt-1 text-xs text-emerald-700">{t('parent.siblingDiscount', { pct: c.discountPct ?? 0, amount: fmtTZS(c.discount ?? 0), rank: c.familyRank ?? 2, size: c.familySize ?? 2 })}</p>}
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{t('common.billed')}: <span className="font-medium text-foreground">{fmtTZS(c.dueTotal)}</span></span>
                    <span>{t('common.paid')}: <span className="font-medium text-foreground">{fmtTZS(c.paid)}</span></span>
                  </div>
                </div>

                {/* Grades */}
                <div>
                  <span className="text-sm font-medium flex items-center gap-1.5 mb-2">
                    <GraduationCap className="w-4 h-4 text-blue-600" /> {t('parent.recentResults')}
                  </span>
                  {c.grades.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('common.noResultsYet')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {c.grades.map((g) => (
                        <div key={g.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {g.subject} <span className="text-xs">({g.exam})</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{g.marks}/{g.totalMarks}</span>
                            <Badge className={`text-xs ${gradeColor(g.grade)}`} variant="secondary">{g.grade}</Badge>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment history with a receipt for every payment. */}
                <ChildPayments child={c} />

                {/* Documents: the same PDFs the office prints, for this child only. */}
                <ChildDocuments child={c} />

                {/* This week's timetable for the child's class. */}
                <ChildTimetable slots={c.timetable ?? []} classId={c.classId ?? null} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* One statement for all the children in a school */}
      {!isStaffView && familySchools.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <Receipt className="w-4 h-4 text-primary" /> <span className="font-medium">{t('parent.family')}</span>
          {familySchools.map((s) => <Button key={s.id} asChild size="sm" variant="outline"><a href={`/api/fees/family-statement?schoolId=${s.id}`} target="_blank" rel="noopener">{t('parent.familyStatement')}{manySchools ? ` · ${s.name}` : ''} ({s.children})</a></Button>)}
        </div>
      )}

      {/* PARENT VIEW: no children linked */}
      {!isStaffView && childrenData.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Heart className="w-7 h-7" />
            </div>
            <h3 className="font-semibold mb-1">{t('parent.noChildrenTitle')}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t('parent.noChildrenBody')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* STAFF/ADMIN VIEW: guardians directory */}
      {isStaffView && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> {t('parent.directory')}
                <Badge variant="secondary" className="ml-1">{directory.length}</Badge>
              </CardTitle>
              <Button size="sm" className="gap-1.5" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add guardian
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {directory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No guardians recorded yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {directory.map((g) => (
                  <div key={g.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                          <UserIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{g.name}</p>
                          {g.relationship && <p className="text-xs text-muted-foreground">{g.relationship}</p>}
                        </div>
                      </div>
                      {g.linked ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-xs gap-1">
                            <KeyRound className="w-3 h-3" /> Portal linked
                          </Badge>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                            disabled={busyId === g.id}
                            onClick={() => removeLogin(g)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0"
                          disabled={busyId === g.id}
                          onClick={() => createLogin(g)}
                          title={g.email ? `Create a portal login for ${g.email}` : 'This guardian has no email on record'}
                        >
                          <KeyRound className="w-3 h-3" />
                          {busyId === g.id ? 'Creating…' : 'Create login'}
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {g.phone}</span>
                      {g.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> <span suppressHydrationWarning>{g.email}</span></span>}
                    </div>
                    {g.children.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {g.children.map((ch) => (
                          <Badge key={ch.id} variant="outline" className="text-xs font-normal gap-1 pr-1">
                            {ch.name} · {ch.className}{ch.isPrimary ? ' ★' : ''}
                            <button
                              type="button"
                              className="rounded-sm hover:text-destructive disabled:opacity-40"
                              disabled={busyId === g.id}
                              onClick={() => unlinkChild(g, ch.id, ch.name)}
                              aria-label={`Unlink ${g.name} from ${ch.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isStaffView && (
        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">{t('parent.homework')}<a href="/dashboard/messages" className="text-sm font-normal text-primary hover:underline">Message a teacher</a></CardTitle></CardHeader>
          <CardContent>
            {homework.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">{t('parent.noHomework')}</p> : (
              <div className="space-y-3">{homework.map((h) => (
                <div key={h.id} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant={h.kind === 'HOMEWORK' ? 'default' : 'secondary'} className="text-xs">{h.kind === 'HOMEWORK' ? 'Homework' : 'Note'}</Badge><p className="font-medium text-sm">{h.title}</p><span className="text-xs text-muted-foreground">{h.className}{h.subjectName ? ` · ${h.subjectName}` : ''}{h.teacher ? ` · ${h.teacher}` : ''}</span></div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{h.description}</p>
                  {h.dueDate && <p className="text-xs mt-1 font-medium">Due {new Date(h.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>}
                </div>
              ))}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Announcements (real data) */}
      <Card>
        <CardHeader><CardTitle>{t('parent.announcements')}</CardTitle></CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('parent.noAnnouncements')}</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{a.title}{a.schoolName ? <span className="ml-2 text-xs font-normal text-muted-foreground">{a.schoolName}</span> : null}</p>
                    {!a.isPublic && <Badge variant="outline" className="text-xs">Staff</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{a.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Add / edit a guardian */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? 'Edit guardian' : 'Add guardian'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First name</Label>
                <Input value={form.firstName} onChange={(e: any) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={(e: any) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.phone')}</Label>
                <Input value={form.phone} placeholder="+255 7.. ... ..." onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('parent.relationship')}</Label>
                <Input value={form.relationship} placeholder="Mother, Father, Uncle…" onChange={(e: any) => setForm({ ...form, relationship: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-muted-foreground font-normal">(optional — needed for a portal login)</span></Label>
              <Input value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Occupation <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={form.occupation} onChange={(e: any) => setForm({ ...form, occupation: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={form.address} onChange={(e: any) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            {!form.id && (
              <div className="space-y-2">
                <Label>{t('common.pupil')}</Label>
                <Select value={form.studentId} onValueChange={(v: string) => setForm({ ...form, studentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose the pupil" /></SelectTrigger>
                  <SelectContent>
                    {studentOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name} · {o.admissionNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A guardian is always attached to at least one pupil. More can be linked afterwards.
                </p>
              </div>
            )}
            <Button
              className="w-full"
              disabled={busyId === 'form' || !form.firstName.trim() || !form.lastName.trim() || form.phone.trim().length < 6 || (!form.id && !form.studentId)}
              onClick={saveGuardian}
            >
              {busyId === 'form' ? 'Saving…' : form.id ? 'Save changes' : 'Add guardian'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link an existing guardian to another pupil */}
      <Dialog open={Boolean(linkFor)} onOpenChange={(o: boolean) => { if (!o) setLinkFor(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link {linkFor?.name} to another pupil</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{t('common.pupil')}</Label>
              <Select value={linkStudentId} onValueChange={setLinkStudentId}>
                <SelectTrigger><SelectValue placeholder="Choose a pupil" /></SelectTrigger>
                <SelectContent>
                  {studentOptions
                    .filter((o) => !linkFor?.children.some((c) => c.id === o.id))
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name} · {o.admissionNo}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!linkStudentId || busyId === linkFor?.id} onClick={linkChild}>
              {busyId === linkFor?.id ? 'Linking…' : 'Link pupil'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(newLogin)} onOpenChange={(o: boolean) => { if (!o) setNewLogin(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Portal login created for {newLogin?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Write this down now — the password cannot be shown again. Ask them to change it after
              signing in.
            </p>
            <div className="rounded-md bg-muted p-3 space-y-2 font-mono text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs">{t('common.email')}</span>
                <span className="truncate">{newLogin?.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs">{t('auth.password')}</span>
                <span>{newLogin?.password}</span>
              </div>
            </div>
            <Button
              variant="outline" className="w-full gap-2"
              onClick={() => {
                navigator.clipboard?.writeText(`${newLogin?.email} / ${newLogin?.password}`)
                toast.success('Copied')
              }}
            >
              <Copy className="h-4 w-4" /> Copy both
            </Button>
            <Button className="w-full" onClick={() => setNewLogin(null)}>{t('common.done')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


/** Report card (per published term) and fee statement downloads for one child. */
function ChildDocuments({ child }: { child: Child }) {
  const { t } = useI18n()
  const terms = child.terms ?? []
  const [termId, setTermId] = useState(terms[0]?.id ?? '')
  return (
    <div className="rounded-lg border p-3">
      <span className="text-sm font-medium flex items-center gap-1.5 mb-2"><FileDown className="w-4 h-4 text-primary" /> {t('parent.documents')}</span>
      <div className="flex flex-wrap items-center gap-2">
        {terms.length > 1 && (
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <Button asChild size="sm" variant="outline" className="gap-1.5" disabled={terms.length === 0}>
          <a href={`/api/reports/report-card?studentId=${child.id}${termId ? `&termId=${termId}` : ''}`} target="_blank" rel="noopener">{t('parent.reportCard')}{terms.length === 1 ? ` · ${terms[0].name}` : ''}</a>
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href={`/api/reports/fee-statement?studentId=${child.id}`} target="_blank" rel="noopener">{t('parent.feeStatement')}</a>
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href={`/api/fees/invoice?studentId=${child.id}`} target="_blank" rel="noopener">{t('parent.invoice')}</a>
        </Button>
        {child.classId && (child.timetable?.length ?? 0) > 0 && (
          <Button asChild size="sm" variant="ghost" className="gap-1.5"><a href={`/api/timetable/pdf?classId=${child.classId}`} target="_blank" rel="noopener">{t('parent.timetablePdf')}</a></Button>
        )}
      </div>
      {terms.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{t('parent.noReportsYet')}</p>}
    </div>
  )
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function ChildTimetable({ slots, classId }: { slots: ChildSlot[]; classId: string | null }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!classId || slots.length === 0) return null
  const today = new Date().getDay()
  const todays = slots.filter((s) => s.dayOfWeek === today)
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-medium flex items-center gap-1.5 mb-1 w-full text-left">
        <CalendarCheck className="w-4 h-4 text-violet-600" /> {t('parent.timetable')}
        <span className="ml-auto text-xs text-muted-foreground">{open ? t('common.hide') : todays.length ? t('parent.lessonsToday', { n: todays.length }) : t('parent.showWeek')}</span>
      </button>
      {open ? (
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5].map((d) => { const day = slots.filter((s) => s.dayOfWeek === d); return day.length ? (
            <div key={d} className="text-xs"><span className="font-semibold">{DAY_NAMES[d]}</span>
              <ul className="mt-0.5 space-y-0.5">{day.map((s) => <li key={s.id} className="flex justify-between gap-2 text-muted-foreground"><span>{s.startTime}–{s.endTime} <span className="text-foreground">{s.subject}</span></span><span className="truncate">{s.teacher}{s.room ? ` · ${s.room}` : ''}</span></li>)}</ul>
            </div>) : null })}
        </div>
      ) : todays.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">{todays.map((s) => <li key={s.id} className="flex justify-between gap-2"><span>{s.startTime} <span className="text-foreground">{s.subject}</span></span><span className="truncate">{s.teacher}</span></li>)}</ul>
      )}
    </div>
  )
}

/** Every payment recorded for the child, newest first, each with its receipt. */
function ChildPayments({ child }: { child: Child }) {
  const { t, locale } = useI18n()
  const [all, setAll] = useState(false)
  const payments = child.payments ?? []
  const shown = all ? payments : payments.slice(0, 5)
  return (
    <div>
      <span className="text-sm font-medium flex items-center gap-1.5 mb-2"><Receipt className="w-4 h-4 text-emerald-600" /> {t('parent.payments')}</span>
      {payments.length === 0 ? <p className="text-xs text-muted-foreground">{t('parent.noPayments')}</p> : (
        <ul className="divide-y rounded-lg border text-xs">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0"><span className="block truncate font-medium">{p.fee}</span><span className="block text-muted-foreground">{new Date(p.paidAt).toLocaleDateString(locale === 'sw' ? 'sw-TZ' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {p.method}{p.receiptNo ? ` · ${p.receiptNo}` : ''}</span></span>
              <span className="flex shrink-0 items-center gap-2"><span className="tabular-nums font-medium">{fmtTZS(p.amount)}</span><a href={`/api/fees/receipt?paymentId=${p.id}`} target="_blank" rel="noopener" className="text-primary hover:underline">{t('parent.receipt')}</a></span>
            </li>
          ))}
        </ul>
      )}
      {payments.length > 5 && !all && <button type="button" onClick={() => setAll(true)} className="mt-1 text-xs text-primary hover:underline">{t('parent.showAllPayments', { n: payments.length })}</button>}
    </div>
  )
}
