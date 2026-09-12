'use client'

import { useI18n } from '@/lib/i18n-context'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, NotebookPen, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'

interface Item { id: string; classId: string; className: string; subjectId: string | null; subjectName: string | null; kind: 'HOMEWORK' | 'NOTE'; title: string; description: string; dueDate: string | null; visibleToGuardians: boolean; teacher: string | null; createdById: string | null; createdAt: string }
interface Props { classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]; teachable: { classId: string; subjectIds: string[] }[]; me: string; isAdmin: boolean }

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')
const today = () => new Date().toISOString().slice(0, 10)
const empty = { id: '', classId: '', subjectId: 'NONE', kind: 'HOMEWORK' as 'HOMEWORK' | 'NOTE', title: '', description: '', dueDate: '', visibleToGuardians: true }

export function HomeworkClient({ classes, subjects, teachable, me, isAdmin }: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const [classId, setClassId] = useState('ALL')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...empty, classId: classes[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => fetch(`/api/homework${classId !== 'ALL' ? `?classId=${classId}` : ''}`).then((r) => r.json()).then((d) => setItems(d.assignments ?? [])).catch(() => toast.error('Could not load')), [classId])
  useEffect(() => { load() }, [load])
  const subjectsFor = (cid: string) => { const t = teachable.find((x) => x.classId === cid); return subjects.filter((s) => t?.subjectIds.includes(s.id)) }
  const openNew = () => { setForm({ ...empty, classId: classId !== 'ALL' ? classId : classes[0]?.id ?? '' }); setOpen(true) }
  const openEdit = (i: Item) => { setForm({ id: i.id, classId: i.classId, subjectId: i.subjectId ?? 'NONE', kind: i.kind, title: i.title, description: i.description, dueDate: i.dueDate ? i.dueDate.slice(0, 10) : '', visibleToGuardians: i.visibleToGuardians }); setOpen(true) }
  const save = async () => {
    setSaving(true)
    try {
      const body = { ...(form.id ? { id: form.id } : {}), classId: form.classId, subjectId: form.subjectId === 'NONE' ? null : form.subjectId, kind: form.kind, title: form.title, description: form.description, dueDate: form.dueDate || null, visibleToGuardians: form.visibleToGuardians }
      const res = await fetch('/api/homework', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      toast.success(form.id ? 'Updated' : form.visibleToGuardians ? 'Posted — parents and pupils with logins have been notified' : 'Posted (staff only)')
      setOpen(false); load()
    } finally { setSaving(false) }
  }
  const remove = async (i: Item) => { if (!window.confirm(`Remove "${i.title}"?`)) return; const res = await fetch(`/api/homework?id=${i.id}`, { method: 'DELETE' }); if (!res.ok) { toast.error('Could not remove'); return } load() }
  const overdue = (i: Item) => i.kind === 'HOMEWORK' && i.dueDate && i.dueDate.slice(0, 10) < today()

  return (
    <div className="space-y-4">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('homework.title2')}</h1>
            <p className="text-muted-foreground mt-1">Post homework with a due date, or a lesson note. Parents and pupils see them on their portals and get a notification.</p>
          </div>
          <Button className="gap-1.5" onClick={openNew} disabled={classes.length === 0}><Plus className="h-4 w-4" /> Post</Button>
        </div>
      </FadeIn>
      <Select value={classId} onValueChange={setClassId}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('homework.allMyClasses')}</SelectItem>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      <div className="grid gap-3 md:grid-cols-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground p-6">{t('homework.none')}</p>}
        {items.map((i) => (
          <Card key={i.id} className={overdue(i) ? 'border-muted' : ''}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={i.kind === 'HOMEWORK' ? 'default' : 'secondary'} className="gap-1">{i.kind === 'HOMEWORK' ? <CalendarClock className="h-3 w-3" /> : <NotebookPen className="h-3 w-3" />}{i.kind === 'HOMEWORK' ? 'Homework' : 'Note'}</Badge>
                    <span className="text-xs text-muted-foreground">{i.className}{i.subjectName ? ` · ${i.subjectName}` : ''}{i.teacher ? ` · ${i.teacher}` : ''}</span>
                    {!i.visibleToGuardians && <Badge variant="outline" className="text-[10px]">staff only</Badge>}
                  </div>
                  <p className="mt-1 font-medium">{i.title}</p>
                </div>
                {(isAdmin || i.createdById === me) && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-sm" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon-sm" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button></div>}
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.description}</p>
              <p className="text-xs text-muted-foreground">{i.dueDate ? `Due ${fmt(i.dueDate)}${overdue(i) ? ' · past' : ''}` : `Posted ${fmt(i.createdAt)}`}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? 'Edit' : 'Post homework or a note'}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">{t('common.class')}</Label><Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v, subjectId: 'NONE' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-xs">{t('common.subject')}</Label><Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">— general —</SelectItem>{subjectsFor(form.classId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">{t('homework.kind')}</Label><Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as 'HOMEWORK' | 'NOTE' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="HOMEWORK">{t('homework.homework')}</SelectItem><SelectItem value="NOTE">{t('homework.note')}</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-xs">{t('homework.dueDate')}</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} disabled={form.kind === 'NOTE'} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t('common.title')}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Exercise 4.2, questions 1–10" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('homework.details')}</Label><Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What to do, pages, materials…" /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.visibleToGuardians} onCheckedChange={(v) => setForm({ ...form, visibleToGuardians: v })} /> Visible to parents and pupils</label>
            <Button onClick={save} disabled={saving || !form.classId || form.title.trim().length < 2 || !form.description.trim()}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Post'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
