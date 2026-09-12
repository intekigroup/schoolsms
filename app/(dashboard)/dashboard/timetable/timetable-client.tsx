'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/animate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, FileDown, GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Drag-and-drop timetable.
 *   – drag a subject chip from the tray into a period to timetable it (the
 *     teacher on the class's teaching load is filled in);
 *   – drag a lesson to another period to move it; drop onto a lesson to swap;
 *   – a teacher booked in two classes at the same time is flagged and refused
 *     unless the office confirms;
 *   – "By teacher" shows one person's week with free periods.
 * Teachers get the same views read-only, with their own lessons highlighted.
 */

const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday']] as const
const DEFAULT_PERIODS = ['07:30', '08:15', '09:00', '09:45', '10:30', '11:15', '12:00', '14:00', '14:45', '15:30']
const LESSON_MIN = 45

interface Slot { id: string; dayOfWeek: number; startTime: string; endTime: string; room: string; classId: string; className: string; subjectId: string | null; subjectName: string; staffId: string | null; teacherName: string }
interface Opt { id: string; name: string }
interface Props { classes: (Opt & { subjectIds: string[] })[]; subjects: Opt[]; teachers: Opt[]; slots: Slot[]; load: { staffId: string; subjectId: string; classId: string | null }[]; readOnly?: boolean; mine?: string | null; /** A pupil or guardian: class view only, no teacher tab. */ viewer?: boolean }

function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(':').map(Number); const t = h * 60 + m + mins
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const COLORS = ['bg-sky-100 text-sky-900 border-sky-200', 'bg-emerald-100 text-emerald-900 border-emerald-200', 'bg-amber-100 text-amber-900 border-amber-200', 'bg-violet-100 text-violet-900 border-violet-200', 'bg-rose-100 text-rose-900 border-rose-200', 'bg-teal-100 text-teal-900 border-teal-200', 'bg-orange-100 text-orange-900 border-orange-200', 'bg-indigo-100 text-indigo-900 border-indigo-200']
const colorFor = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length]

function SubjectChip({ subject }: { subject: Opt }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${subject.id}`, data: { kind: 'new', subjectId: subject.id } })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn('flex cursor-grab items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium select-none touch-none', colorFor(subject.name), isDragging && 'opacity-40')}>
      <GripVertical className="h-3 w-3 opacity-60" />{subject.name}
    </div>
  )
}

function LessonCard({ slot, clash, mine, readOnly, label, onEdit, onDelete }: { slot: Slot; clash: boolean; mine: boolean; readOnly: boolean; label: string; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `slot:${slot.id}`, data: { kind: 'slot', slot }, disabled: readOnly })
  return (
    <div ref={setNodeRef} {...(readOnly ? {} : listeners)} {...attributes}
      className={cn('group relative h-full rounded-md border px-2 py-1.5 text-left text-xs select-none', colorFor(slot.subjectName), !readOnly && 'cursor-grab touch-none', isDragging && 'opacity-30', clash && 'ring-2 ring-red-500', mine && 'ring-2 ring-primary')}
      onDoubleClick={() => !readOnly && onEdit()} title={readOnly ? undefined : 'Drag to move · double-click to edit'}>
      <p className="font-semibold leading-tight">{slot.subjectName || 'Lesson'}</p>
      <p className="text-[10px] opacity-80 leading-tight">{label}</p>
      {slot.room && <p className="text-[10px] opacity-60">Room {slot.room}</p>}
      {clash && <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-red-600" />}
      {!readOnly && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete() }} className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow group-hover:flex" aria-label="Clear lesson"><Trash2 className="h-3 w-3" /></button>
      )}
    </div>
  )
}

function Cell({ day, time, children, droppable }: { day: number; time: string; children: React.ReactNode; droppable: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${day}:${time}`, data: { day, time }, disabled: !droppable })
  return <td ref={setNodeRef} className={cn('h-16 p-1 align-top transition-colors', isOver && 'bg-primary/10 ring-2 ring-inset ring-primary/40 rounded-md')}>{children}</td>
}

export function TimetableClient({ classes, subjects, teachers, slots: initial, load, readOnly = false, mine = null, viewer = false }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [slots, setSlots] = useState<Slot[]>(initial)
  const [view, setView] = useState<'class' | 'teacher'>(mine && readOnly ? 'teacher' : 'class')
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [teacherId, setTeacherId] = useState(mine ?? teachers[0]?.id ?? '')
  const [periods, setPeriods] = useState<string[]>(() => [...new Set([...DEFAULT_PERIODS, ...initial.map((s) => s.startTime)])].sort())
  const [newPeriod, setNewPeriod] = useState('')
  const [active, setActive] = useState<{ kind: 'new'; subjectId: string } | { kind: 'slot'; slot: Slot } | null>(null)
  const [edit, setEdit] = useState<Slot | null>(null)
  const [editForm, setEditForm] = useState({ subjectId: '', staffId: 'NONE', room: '', endTime: '' })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }))

  const cls = classes.find((c) => c.id === classId)
  const traySubjects = useMemo(() => {
    if (!cls) return subjects
    const own = subjects.filter((s) => cls.subjectIds.includes(s.id)), rest = subjects.filter((s) => !cls.subjectIds.includes(s.id))
    return [...own, ...rest]
  }, [cls, subjects])
  const teacherName = (id: string | null) => teachers.find((x) => x.id === id)?.name ?? ''
  /** Default teacher for a subject in a class, from the teaching load. */
  const defaultTeacher = (subjectId: string) => load.find((l) => l.subjectId === subjectId && l.classId === classId)?.staffId ?? load.find((l) => l.subjectId === subjectId && l.classId === null)?.staffId ?? null
  // Teacher clashes: same day + start, same teacher, different classes.
  const clashes = useMemo(() => {
    const set = new Set<string>()
    for (const a of slots) for (const b of slots) if (a.id !== b.id && a.staffId && a.staffId === b.staffId && a.dayOfWeek === b.dayOfWeek && a.startTime === b.startTime && a.classId !== b.classId) set.add(a.id)
    return set
  }, [slots])

  const visible = view === 'class' ? slots.filter((s) => s.classId === classId) : slots.filter((s) => s.staffId === teacherId)
  const at = (day: number, time: string) => visible.find((s) => s.dayOfWeek === day && s.startTime === time)
  const nextPeriodEnd = (time: string) => { const i = periods.indexOf(time); return i >= 0 && periods[i + 1] && periods[i + 1] > time && periods[i + 1] <= addMinutes(time, 90) ? periods[i + 1] : addMinutes(time, LESSON_MIN) }

  const call = useCallback(async (init: RequestInit & { path?: string }) => {
    const res = await fetch(init.path ?? '/api/timetable', { ...init, headers: { 'Content-Type': 'application/json' } })
    const d = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, d }
  }, [])

  const create = async (subjectId: string, day: number, time: string, force = false) => {
    const body = { classId, dayOfWeek: day, startTime: time, endTime: nextPeriodEnd(time), subjectId, staffId: defaultTeacher(subjectId), force }
    const r = await call({ method: 'POST', body: JSON.stringify(body) })
    if (r.status === 409 && r.d.clash && window.confirm(`${r.d.error}\n\nTimetable it anyway?`)) return create(subjectId, day, time, true)
    if (!r.ok) { toast.error(r.d.error ?? 'Could not save'); return }
    const s = r.d.slot
    setSlots((all) => [...all.filter((x) => !(x.classId === classId && x.dayOfWeek === day && x.startTime === time)), { id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, room: s.room ?? '', classId, className: cls?.name ?? '', subjectId, subjectName: subjects.find((x) => x.id === subjectId)?.name ?? '', staffId: s.staffId, teacherName: teacherName(s.staffId) }])
    router.refresh()
  }
  const move = async (slot: Slot, day: number, time: string, opts: { force?: boolean; swap?: boolean } = {}) => {
    if (slot.dayOfWeek === day && slot.startTime === time) return
    const r = await call({ method: 'PATCH', body: JSON.stringify({ id: slot.id, dayOfWeek: day, startTime: time, endTime: nextPeriodEnd(time), ...opts }) })
    if (r.status === 409 && r.d.occupied && window.confirm('That period already has a lesson. Swap the two?')) return move(slot, day, time, { ...opts, swap: true })
    if (r.status === 409 && r.d.clash && window.confirm(`${r.d.error}\n\nMove it anyway?`)) return move(slot, day, time, { ...opts, force: true })
    if (!r.ok) { toast.error(r.d.error ?? 'Could not move'); return }
    setSlots((all) => all.map((x) => x.id === slot.id ? { ...x, dayOfWeek: day, startTime: time, endTime: nextPeriodEnd(time) } : x.id === r.d.swappedWith ? { ...x, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime } : x))
    router.refresh()
  }
  const remove = async (slot: Slot) => {
    const r = await call({ path: `/api/timetable?id=${slot.id}`, method: 'DELETE' })
    if (!r.ok) { toast.error(r.d.error ?? 'Could not clear'); return }
    setSlots((all) => all.filter((x) => x.id !== slot.id)); router.refresh()
  }
  const openEdit = (slot: Slot) => { setEdit(slot); setEditForm({ subjectId: slot.subjectId ?? '', staffId: slot.staffId ?? 'NONE', room: slot.room, endTime: slot.endTime }) }
  const saveEdit = async (force = false) => {
    if (!edit) return
    const r = await call({ method: 'PATCH', body: JSON.stringify({ id: edit.id, subjectId: editForm.subjectId || undefined, staffId: editForm.staffId === 'NONE' ? null : editForm.staffId, room: editForm.room, endTime: editForm.endTime, force }) })
    if (r.status === 409 && r.d.clash && window.confirm(`${r.d.error}\n\nSave anyway?`)) return saveEdit(true)
    if (!r.ok) { toast.error(r.d.error ?? 'Could not save'); return }
    setSlots((all) => all.map((x) => x.id === edit.id ? { ...x, subjectId: editForm.subjectId, subjectName: subjects.find((s) => s.id === editForm.subjectId)?.name ?? x.subjectName, staffId: editForm.staffId === 'NONE' ? null : editForm.staffId, teacherName: editForm.staffId === 'NONE' ? '' : teacherName(editForm.staffId), room: editForm.room, endTime: editForm.endTime } : x))
    setEdit(null); router.refresh()
  }

  const onDragStart = (e: DragStartEvent) => setActive(e.active.data.current as any)
  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as any, over = e.over?.data.current as any
    setActive(null)
    if (!over || readOnly || view !== 'class') return
    if (data.kind === 'new') create(data.subjectId, over.day, over.time)
    else if (data.kind === 'slot') move(data.slot, over.day, over.time)
  }
  const addPeriod = () => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newPeriod)) { toast.error('Use HH:MM'); return } setPeriods((p) => [...new Set([...p, newPeriod])].sort()); setNewPeriod('') }
  const weekly = visible.length
  const free = view === 'teacher' ? DAYS.length * periods.length - weekly : null
  const printHref = view === 'class' ? `/api/timetable/pdf?classId=${classId}` : `/api/timetable/pdf?staffId=${teacherId}`

  return (
    <div className="space-y-4">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.timetable')}</h1>
            <p className="text-muted-foreground mt-1">{readOnly ? 'Your week and the classes you teach. Your own lessons are outlined.' : 'Drag a subject into a period. Drag a lesson to move it, drop it on another to swap. Double-click to edit.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {clashes.size > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {clashes.size / 2 | 0 || 1} teacher clash{clashes.size > 2 ? 'es' : ''}</Badge>}
            <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={printHref}><FileDown className="h-4 w-4" /> Print PDF</a></Button>
          </div>
        </div>
      </FadeIn>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as 'class' | 'teacher')}>
          {!viewer && <TabsList><TabsTrigger value="class">By class</TabsTrigger><TabsTrigger value="teacher">{mine && readOnly ? 'My week' : 'By teacher'}</TabsTrigger></TabsList>}
        </Tabs>
        {view === 'class' ? (
          <Select value={classId} onValueChange={setClassId}><SelectTrigger className="w-56"><SelectValue placeholder="Class" /></SelectTrigger><SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        ) : (
          <Select value={teacherId} onValueChange={setTeacherId} disabled={readOnly}><SelectTrigger className="w-56"><SelectValue placeholder="Teacher" /></SelectTrigger><SelectContent>{(readOnly && mine ? teachers.filter((x) => x.id === mine) : teachers).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select>
        )}
        <p className="text-xs text-muted-foreground pb-2">{weekly} lesson{weekly === 1 ? '' : 's'} a week{free !== null ? ` · ${free} free period${free === 1 ? '' : 's'}` : ''}</p>
        {!readOnly && <span className="flex-1" />}
        {!readOnly && <div className="flex items-end gap-1"><div className="space-y-1"><Label className="text-xs">Add period</Label><Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="13:15" className="h-8 w-24" /></div><Button size="sm" variant="outline" className="h-8 gap-1" onClick={addPeriod}><Plus className="h-3 w-3" /></Button></div>}
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className={cn('grid gap-4', !readOnly && view === 'class' && 'lg:grid-cols-[200px_1fr]')}>
          {!readOnly && view === 'class' && (
            <Card className="h-fit lg:sticky lg:top-4">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">SUBJECTS — drag into the grid</p>
                <div className="flex flex-wrap gap-1.5 lg:flex-col">{traySubjects.map((s) => <SubjectChip key={s.id} subject={s} />)}</div>
                <p className="text-[11px] text-muted-foreground pt-1">Teacher is filled from the class&apos;s teaching load; double-click a lesson to change it or set a room.</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm table-fixed">
                <thead><tr className="border-b bg-muted/50"><th className="w-24 p-2 text-left text-xs font-medium">Period</th>{DAYS.map(([, d]) => <th key={d} className="p-2 text-center text-xs font-medium">{d}</th>)}</tr></thead>
                <tbody>
                  {periods.map((time) => (
                    <tr key={time} className="border-b">
                      <td className="p-2 align-top font-mono text-xs text-muted-foreground">{time}<span className="block text-[10px] opacity-70">–{nextPeriodEnd(time)}</span></td>
                      {DAYS.map(([day]) => {
                        const slot = at(day, time)
                        return (
                          <Cell key={day} day={day} time={time} droppable={!readOnly && view === 'class'}>
                            {slot ? (
                              <LessonCard slot={slot} clash={clashes.has(slot.id)} mine={!!mine && slot.staffId === mine} readOnly={readOnly || view !== 'class'} label={view === 'class' ? slot.teacherName : slot.className} onEdit={() => openEdit(slot)} onDelete={() => remove(slot)} />
                            ) : view === 'teacher' ? (
                              <div className="flex h-full items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground/60">free</div>
                            ) : !readOnly ? (
                              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-transparent text-muted-foreground/30 hover:border-primary/30"><Plus className="h-3.5 w-3.5" /></div>
                            ) : <div className="h-full" />}
                          </Cell>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
        <DragOverlay>{active ? <div className={cn('rounded-md border px-2 py-1 text-xs font-semibold shadow-lg', colorFor(active.kind === 'new' ? subjects.find((s) => s.id === active.subjectId)?.name ?? '' : active.slot.subjectName))}>{active.kind === 'new' ? subjects.find((s) => s.id === active.subjectId)?.name : active.slot.subjectName}</div> : null}</DragOverlay>
      </DndContext>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.className} · {DAYS.find(([d]) => d === edit?.dayOfWeek)?.[1]} {edit?.startTime}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label className="text-xs">Subject</Label><Select value={editForm.subjectId} onValueChange={(v) => setEditForm({ ...editForm, subjectId: v, staffId: defaultTeacher(v) ?? editForm.staffId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Teacher</Label><Select value={editForm.staffId} onValueChange={(v) => setEditForm({ ...editForm, staffId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">— none —</SelectItem>{teachers.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Room</Label><Input value={editForm.room} onChange={(e) => setEditForm({ ...editForm, room: e.target.value })} placeholder="e.g. Lab 2" /></div>
              <div className="space-y-1"><Label className="text-xs">Ends</Label><Input value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })} placeholder="08:15" /></div>
            </div>
            <div className="flex justify-between"><Button variant="ghost" className="text-destructive" onClick={() => { if (edit) { remove(edit); setEdit(null) } }}>Clear lesson</Button><Button onClick={() => saveEdit()}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
