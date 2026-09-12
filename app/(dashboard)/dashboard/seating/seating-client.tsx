'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/animate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileDown, GripVertical, Save, Shuffle, Eraser, ArrowDownAZ, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Seating plan: a rows × cols grid of desks seen from the teacher's desk
 * (front of the room at the top). Drag pupils from the tray onto a seat, drag
 * a seated pupil to another seat (drop on someone to swap), or drag back to
 * the tray. Auto-fill A–Z or boy–girl for a starting point. Saved per class.
 */
interface Pupil { id: string; name: string; gender: string; admissionNo: string; photoUrl: string | null }
interface Seat { studentId: string; row: number; col: number }

const key = (r: number, c: number) => `${r}:${c}`
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

function PupilChip({ pupil, seated, disabled }: { pupil: Pupil; seated: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pupil:${pupil.id}`, data: { pupilId: pupil.id }, disabled })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('flex h-full w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs select-none', pupil.gender === 'MALE' ? 'bg-sky-50 border-sky-200 text-sky-950' : 'bg-rose-50 border-rose-200 text-rose-950', !disabled && 'cursor-grab touch-none', isDragging && 'opacity-30', seated && 'h-full')}>
      {pupil.photoUrl ? <img src={pupil.photoUrl} alt="" className="h-7 w-6 shrink-0 rounded object-cover" /> : <span className="flex h-7 w-6 shrink-0 items-center justify-center rounded bg-white/70 text-[10px] font-bold">{initials(pupil.name)}</span>}
      <span className="min-w-0"><span className="block truncate font-medium leading-tight">{pupil.name}</span><span className="block truncate text-[10px] opacity-70">{pupil.admissionNo}</span></span>
      {!disabled && <GripVertical className="ml-auto h-3 w-3 shrink-0 opacity-40" />}
    </div>
  )
}

function Desk({ r, c, children, disabled }: { r: number; c: number; children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `seat:${r}:${c}`, data: { r, c }, disabled })
  return (
    <div ref={setNodeRef} className={cn('flex h-14 items-stretch rounded-md border border-dashed bg-muted/30 p-0.5 transition-colors', isOver && 'border-primary bg-primary/10', children ? 'border-solid border-transparent' : '')}>
      {children ?? <span className="m-auto text-[10px] text-muted-foreground/50">{r + 1}·{c + 1}</span>}
    </div>
  )
}

function Tray({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray', disabled })
  return <div ref={setNodeRef} className={cn('grid gap-1.5 rounded-lg border p-2 min-h-[80px] sm:grid-cols-2 lg:grid-cols-1', isOver && 'border-primary bg-primary/5')}>{children}</div>
}

export function SeatingClient({ classes, initialClassId }: { classes: { id: string; name: string }[]; initialClassId: string }) {
  const [classId, setClassId] = useState(initialClassId)
  const [info, setInfo] = useState<{ name: string; classTeacher: string | null } | null>(null)
  const [roll, setRoll] = useState<Pupil[]>([])
  const [rows, setRows] = useState(5), [cols, setCols] = useState(6)
  const [seats, setSeats] = useState<Seat[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState<Pupil | null>(null)
  const [filter, setFilter] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }))

  const load = useCallback(async () => {
    if (!classId) return
    const res = await fetch(`/api/seating?classId=${classId}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d?.error ?? 'Could not load'); return }
    setInfo(d.class); setRoll(d.roll); setRows(d.plan.rows); setCols(d.plan.cols); setSeats(d.plan.seats); setCanEdit(d.canEdit); setDirty(false)
  }, [classId])
  useEffect(() => { load() }, [load])

  const byPos = useMemo(() => new Map(seats.map((s) => [key(s.row, s.col), s])), [seats])
  const seatedIds = useMemo(() => new Set(seats.map((s) => s.studentId)), [seats])
  const pupil = (id: string) => roll.find((p) => p.id === id)
  const unseated = roll.filter((p) => !seatedIds.has(p.id) && p.name.toLowerCase().includes(filter.toLowerCase()))

  const place = (pupilId: string, r: number, c: number) => {
    setSeats((cur) => {
      const from = cur.find((s) => s.studentId === pupilId)
      const occupant = cur.find((s) => s.row === r && s.col === c && s.studentId !== pupilId)
      let next = cur.filter((s) => s.studentId !== pupilId && !(s.row === r && s.col === c))
      next.push({ studentId: pupilId, row: r, col: c })
      // Swap: the displaced pupil takes the dragged pupil's old seat, or goes back to the tray.
      if (occupant && from) next.push({ studentId: occupant.studentId, row: from.row, col: from.col })
      return next
    })
    setDirty(true)
  }
  const unseat = (pupilId: string) => { setSeats((cur) => cur.filter((s) => s.studentId !== pupilId)); setDirty(true) }
  const onDragEnd = (e: DragEndEvent) => {
    const pupilId = (e.active.data.current as any)?.pupilId as string
    const over = e.over
    setActive(null)
    if (!pupilId || !over || !canEdit) return
    if (over.id === 'tray') { unseat(pupilId); return }
    const { r, c } = over.data.current as any
    place(pupilId, r, c)
  }
  const resize = (nr: number, nc: number) => { setRows(nr); setCols(nc); setSeats((cur) => cur.filter((s) => s.row < nr && s.col < nc)); setDirty(true) }
  const autoFill = (mode: 'az' | 'boygirl') => {
    const order = mode === 'az' ? [...roll].sort((a, b) => a.name.localeCompare(b.name)) : (() => {
      const boys = roll.filter((p) => p.gender === 'MALE'), girls = roll.filter((p) => p.gender !== 'MALE'), out: Pupil[] = []
      while (boys.length || girls.length) { if (boys.length) out.push(boys.shift()!); if (girls.length) out.push(girls.shift()!) }
      return out
    })()
    const next: Seat[] = []
    let i = 0
    for (let r = 0; r < rows && i < order.length; r++) for (let c = 0; c < cols && i < order.length; c++) next.push({ studentId: order[i++].id, row: r, col: c })
    setSeats(next); setDirty(true)
    if (i < order.length) toast.info(`${order.length - i} pupil(s) did not fit — add rows or columns`)
  }
  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/seating', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, rows, cols, seats }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save'); return }
      toast.success('Seating plan saved'); setDirty(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Seating plan</h1>
            <p className="text-muted-foreground mt-1">{canEdit ? 'Drag pupils onto desks. Drop one pupil on another to swap. Drag back to the tray to unseat.' : 'View only — the class teacher or the office arranges the seating.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`/api/seating?classId=${classId}&format=pdf`}><FileDown className="h-4 w-4" /> Print chart</a></Button>
            {canEdit && <Button size="sm" className="gap-1.5" onClick={save} disabled={!dirty || saving}><Save className="h-4 w-4" /> {saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}</Button>}
          </div>
        </div>
      </FadeIn>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">Class</Label><Select value={classId} onValueChange={setClassId}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        {canEdit && <>
          <div className="space-y-1"><Label className="text-xs">Rows</Label><Input type="number" min={1} max={20} value={rows} onChange={(e) => resize(Math.max(1, Math.min(20, Number(e.target.value) || 1)), cols)} className="w-20" /></div>
          <div className="space-y-1"><Label className="text-xs">Columns</Label><Input type="number" min={1} max={20} value={cols} onChange={(e) => resize(rows, Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-20" /></div>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => autoFill('az')}><ArrowDownAZ className="h-4 w-4" /> A–Z</Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => autoFill('boygirl')}><Shuffle className="h-4 w-4" /> Boy–girl</Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setSeats([]); setDirty(true) }}><Eraser className="h-4 w-4" /> Clear</Button>
        </>}
        <p className="pb-2 text-xs text-muted-foreground"><Users className="mr-1 inline h-3 w-3" />{seats.length} of {roll.length} seated{info?.classTeacher ? ` · class teacher ${info.classTeacher}` : ''}</p>
      </div>

      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(pupil((e.active.data.current as any)?.pupilId) ?? null)} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit lg:sticky lg:top-4">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground">UNSEATED</p><Badge variant="secondary">{roll.length - seats.length}</Badge></div>
              <Input placeholder="Find a pupil" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8" />
              <Tray disabled={!canEdit}>
                {unseated.length === 0 && <p className="col-span-full py-4 text-center text-xs text-muted-foreground">Everyone is seated.</p>}
                {unseated.map((p) => <div key={p.id} className="h-10"><PupilChip pupil={p} seated={false} disabled={!canEdit} /></div>)}
              </Tray>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 space-y-2 overflow-x-auto">
              <div className="rounded-md bg-muted py-1 text-center text-[11px] font-semibold tracking-widest text-muted-foreground">FRONT · TEACHER&apos;S DESK / BOARD</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(120px, 1fr))` }}>
                {Array.from({ length: rows }).flatMap((_, r) => Array.from({ length: cols }).map((_, c) => {
                  const s = byPos.get(key(r, c)); const p = s ? pupil(s.studentId) : undefined
                  return <Desk key={key(r, c)} r={r} c={c} disabled={!canEdit}>{p ? <PupilChip pupil={p} seated disabled={!canEdit} /> : null}</Desk>
                }))}
              </div>
              <p className="text-[11px] text-muted-foreground">Blue = boys, pink = girls. Row 1 is nearest the board.</p>
            </CardContent>
          </Card>
        </div>
        <DragOverlay>{active ? <div className="w-40 rounded-md border bg-card px-2 py-1 text-xs font-semibold shadow-lg">{active.name}</div> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}
