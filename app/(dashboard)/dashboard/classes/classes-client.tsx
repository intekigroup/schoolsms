'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { School, Plus, Users, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'

interface ClassItem {
  id: string; name: string; level: string; stream: string; capacity: number;
  studentCount: number; classTeacher: string; subjects: string[];
  classTeacherId: string; monitorId: string; monitor: string; monitressId: string; monitress: string;
  pupils: { id: string; name: string; gender: string }[];
}

export function ClassesClient({ classes, staff, readOnly = false }: { classes: ClassItem[]; staff: { id: string; name: string }[]; readOnly?: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', level: 'PRIMARY', stream: '', capacity: '40' })
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', name: '', level: 'PRIMARY', stream: '', capacity: '40', classTeacherId: 'NONE', monitorId: 'NONE', monitressId: 'NONE' })
  const editing = classes.find((c) => c.id === editForm.id)
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, capacity: parseInt(form.capacity) || 40 }),
      })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Class created')
      setDialogOpen(false)
      router.refresh()
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const openEdit = (c: ClassItem) => {
    setEditForm({ id: c.id, name: c.name, level: c.level || 'PRIMARY', stream: c.stream || '', capacity: String(c.capacity ?? 40), classTeacherId: c.classTeacherId || 'NONE', monitorId: c.monitorId || 'NONE', monitressId: c.monitressId || 'NONE' })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    setEditLoading(true)
    try {
      const res = await fetch('/api/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, capacity: parseInt(editForm.capacity) || 40, classTeacherId: editForm.classTeacherId === 'NONE' ? null : editForm.classTeacherId, monitorId: editForm.monitorId === 'NONE' ? null : editForm.monitorId, monitressId: editForm.monitressId === 'NONE' ? null : editForm.monitressId }),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d?.error ?? 'Failed to update'); return }
      toast.success('Class updated')
      setEditOpen(false)
      router.refresh()
    } catch { toast.error('Error') } finally { setEditLoading(false) }
  }

  const handleDelete = async (c: ClassItem) => {
    if (!window.confirm(`Delete class ${c.name}? This cannot be undone.`)) return
    setDeletingId(c.id)
    try {
      const res = await fetch(`/api/classes?id=${c.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Failed to delete'); return }
      toast.success('Class deleted')
      router.refresh()
    } catch { toast.error('Error') } finally { setDeletingId(null) }
  }

  const levelColor = (l: string) => {
    switch (l) {
      case 'NURSERY': return 'bg-pink-100 text-pink-700'
      case 'PRIMARY': return 'bg-blue-100 text-blue-700'
      case 'O_LEVEL': return 'bg-green-100 text-green-700'
      case 'A_LEVEL': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.classes')}</h1>
            <p className="text-muted-foreground mt-1">{readOnly ? 'The classes on your teaching load.' : 'Manage classes, streams, class teachers and pupil leaders.'}</p>
          </div>
          {!readOnly && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Add Class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('classes.create')}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>{t('classes.className')}</Label><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Form 1A" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('classes.level')}</Label>
                    <Select value={form.level} onValueChange={(v: string) => setForm({ ...form, level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NURSERY">{t('classes.nursery')}</SelectItem>
                        <SelectItem value="PRIMARY">{t('classes.primary')}</SelectItem>
                        <SelectItem value="O_LEVEL">{t('classes.oLevel')}</SelectItem>
                        <SelectItem value="A_LEVEL">{t('classes.aLevel')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>{t('classes.capacity')}</Label><Input type="number" value={form.capacity} onChange={(e: any) => setForm({ ...form, capacity: e.target.value })} /></div>
                </div>
                <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? 'Creating...' : 'Create Class'}</Button>
              </div>
            </DialogContent>
          </Dialog>}
        </div>
      </FadeIn>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(classes ?? []).map((c: ClassItem) => (
          <StaggerItem key={c.id}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <School className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">{c.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-1 rounded-full ${levelColor(c.level)}`}>
                      {c.level?.replace('_', '-')}
                    </span>
                    {!readOnly && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>}
                    {!readOnly && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c)} disabled={deletingId === c.id} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('classes.students')}</span>
                    <span className="font-medium flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.studentCount}/{c.capacity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('classes.classTeacherLabel')}</span>
                    <span className="font-medium">{c.classTeacher}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('classes.monitor')}</span>
                    <span className="font-medium">{c.monitor || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('classes.monitress')}</span>
                    <span className="font-medium">{c.monitress || '—'}</span>
                  </div>
                  <div className="pt-1"><Button asChild variant="outline" size="sm" className="h-7 gap-1 text-xs"><Link href={`/dashboard/seating?classId=${c.id}`}><LayoutGrid className="h-3 w-3" /> Seating plan</Link></Button></div>
                  {(c.subjects?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {c.subjects.slice(0, 5).map((s: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                      {c.subjects.length > 5 && <Badge variant="outline" className="text-xs">+{c.subjects.length - 5}</Badge>}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('classes.edit')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>{t('classes.className')}</Label><Input value={editForm.name} onChange={(e: any) => setEditForm({ ...editForm, name: e.target.value })} placeholder="e.g. Form 1A" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('classes.level')}</Label>
                <Select value={editForm.level} onValueChange={(v: string) => setEditForm({ ...editForm, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NURSERY">{t('classes.nursery')}</SelectItem>
                    <SelectItem value="PRIMARY">{t('classes.primary')}</SelectItem>
                    <SelectItem value="O_LEVEL">{t('classes.oLevel')}</SelectItem>
                    <SelectItem value="A_LEVEL">{t('classes.aLevel')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t('classes.capacity')}</Label><Input type="number" value={editForm.capacity} onChange={(e: any) => setEditForm({ ...editForm, capacity: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>{t('classes.stream')}</Label><Input value={editForm.stream} onChange={(e: any) => setEditForm({ ...editForm, stream: e.target.value })} placeholder="e.g. A / Science" /></div>
            <div className="space-y-2"><Label>{t('classes.classTeacher')}</Label>
              <Select value={editForm.classTeacherId} onValueChange={(v: string) => setEditForm({ ...editForm, classTeacherId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">— none —</SelectItem>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('classes.monitorBoy')}</Label>
                <Select value={editForm.monitorId} onValueChange={(v: string) => setEditForm({ ...editForm, monitorId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">— none —</SelectItem>{(editing?.pupils ?? []).filter((p) => p.gender === 'MALE').map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>{t('classes.monitressGirl')}</Label>
                <Select value={editForm.monitressId} onValueChange={(v: string) => setEditForm({ ...editForm, monitressId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">— none —</SelectItem>{(editing?.pupils ?? []).filter((p) => p.gender === 'FEMALE').map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <Button onClick={handleEdit} disabled={editLoading} className="w-full">{editLoading ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
