'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { Building2, DoorOpen, Users, Plus, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Occupant { id: string; name: string }
interface Room { id: string; roomNumber: string; capacity: number; occupied: number; occupants: Occupant[] }
interface Dorm { id: string; name: string; gender: string; capacity: number; rooms: Room[] }
interface StudentOpt { id: string; name: string; admissionNo: string; gender: string; assigned: boolean }

export function HostelClient({ dormitories, students }: { dormitories: Dorm[]; students: StudentOpt[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [dormOpen, setDormOpen] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dormForm, setDormForm] = useState({ name: '', gender: 'MALE', capacity: '' })
  const [roomForm, setRoomForm] = useState({ dormitoryId: '', roomNumber: '', capacity: '' })
  const [assignForm, setAssignForm] = useState({ studentId: '', roomId: '' })

  const roomOptions = (dormitories ?? []).flatMap((d) => (d.rooms ?? []).map((r) => ({
    id: r.id, label: `${d.name} – Room ${r.roomNumber} (${r.occupied}/${r.capacity})`, full: r.occupied >= r.capacity,
  })))

  const assignStudent = async () => {
    if (!assignForm.studentId || !assignForm.roomId) { toast.error('Select a student and room'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/hostel/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assignForm) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Student assigned to room')
      setAssignOpen(false); setAssignForm({ studentId: '', roomId: '' }); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  const unassignStudent = async (studentId: string) => {
    try {
      const res = await fetch(`/api/hostel/assign?studentId=${studentId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove'); return }
      toast.success('Student removed from room')
      router.refresh()
    } catch { toast.error('Something went wrong') }
  }

  const totalBeds = (dormitories ?? []).reduce((s, d) => s + d.rooms.reduce((a, r) => a + r.capacity, 0), 0)
  const totalOccupied = (dormitories ?? []).reduce((s, d) => s + d.rooms.reduce((a, r) => a + r.occupied, 0), 0)

  const addDorm = async () => {
    if (!dormForm.name) { toast.error('Dormitory name is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/hostel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'dormitory', ...dormForm }) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Dormitory added')
      setDormOpen(false); setDormForm({ name: '', gender: 'MALE', capacity: '' }); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  const addRoom = async () => {
    if (!roomForm.dormitoryId || !roomForm.roomNumber) { toast.error('Dormitory and room number are required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/hostel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'room', ...roomForm }) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Room added')
      setRoomOpen(false); setRoomForm({ dormitoryId: '', roomNumber: '', capacity: '' }); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.hostel')}</h1>
            <p className="text-muted-foreground mt-1">{t('hostel.subtitle2')}</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild><Button variant="outline" className="gap-2" disabled={roomOptions.length === 0}><UserPlus className="w-4 h-4" /> Assign Student</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('hostel.assignStudent')}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label>{t('hostel.student')}</Label>
                    <Select value={assignForm.studentId} onValueChange={(v: string) => setAssignForm({ ...assignForm, studentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>{(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo}){s.assigned ? ' • assigned' : ''}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('hostel.room')}</Label>
                    <Select value={assignForm.roomId} onValueChange={(v: string) => setAssignForm({ ...assignForm, roomId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                      <SelectContent>{roomOptions.map((r) => <SelectItem key={r.id} value={r.id} disabled={r.full}>{r.label}{r.full ? ' • full' : ''}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button onClick={assignStudent} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Assign'}</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
              <DialogTrigger asChild><Button variant="outline" className="gap-2" disabled={(dormitories?.length ?? 0) === 0}><Plus className="w-4 h-4" /> Room</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('hostel.addRoom')}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label>{t('hostel.dormitory')}</Label>
                    <Select value={roomForm.dormitoryId} onValueChange={(v: string) => setRoomForm({ ...roomForm, dormitoryId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select dormitory" /></SelectTrigger>
                      <SelectContent>{(dormitories ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>{t('hostel.roomNumber')}</Label><Input value={roomForm.roomNumber} onChange={(e: any) => setRoomForm({ ...roomForm, roomNumber: e.target.value })} placeholder="e.g. A1" /></div>
                    <div className="space-y-2"><Label>{t('hostel.beds')}</Label><Input type="number" value={roomForm.capacity} onChange={(e: any) => setRoomForm({ ...roomForm, capacity: e.target.value })} placeholder="4" /></div>
                  </div>
                  <Button onClick={addRoom} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Add Room'}</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dormOpen} onOpenChange={setDormOpen}>
              <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Dormitory</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('hostel.addDorm')}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2"><Label>{t('common.name')}</Label><Input value={dormForm.name} onChange={(e: any) => setDormForm({ ...dormForm, name: e.target.value })} placeholder="e.g. Kilimanjaro Boys Hostel" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('common.gender')}</Label>
                      <Select value={dormForm.gender} onValueChange={(v: string) => setDormForm({ ...dormForm, gender: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="MALE">{t('common.male')}</SelectItem><SelectItem value="FEMALE">{t('common.female')}</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>{t('hostel.capacity')}</Label><Input type="number" value={dormForm.capacity} onChange={(e: any) => setDormForm({ ...dormForm, capacity: e.target.value })} placeholder="50" /></div>
                  </div>
                  <Button onClick={addDorm} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Add Dormitory'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">{t('hostel.dormitories')}</p><p className="text-xl font-bold font-mono">{dormitories?.length ?? 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><DoorOpen className="w-5 h-5 text-green-700 dark:text-green-400" /></div>
          <div><p className="text-xs text-muted-foreground">{t('hostel.totalBeds')}</p><p className="text-xl font-bold font-mono">{totalBeds}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Users className="w-5 h-5 text-amber-700 dark:text-amber-400" /></div>
          <div><p className="text-xs text-muted-foreground">{t('hostel.occupied')}</p><p className="text-xl font-bold font-mono">{totalOccupied}/{totalBeds}</p></div>
        </CardContent></Card>
      </div>

      {(dormitories?.length ?? 0) === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('hostel.noDorms')}</CardContent></Card>
      ) : (
        <Stagger className="grid gap-6 lg:grid-cols-2">
          {(dormitories ?? []).map((d: Dorm) => {
            const occ = (d.rooms ?? []).reduce((sum: number, r: Room) => sum + (r.occupied ?? 0), 0)
            const cap = (d.rooms ?? []).reduce((sum: number, r: Room) => sum + (r.capacity ?? 0), 0)
            return (
              <StaggerItem key={d.id}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />{d.name}</CardTitle>
                      <Badge variant={d.gender === 'MALE' ? 'default' : 'secondary'}>{d.gender}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{occ}/{cap} beds occupied</p>
                  </CardHeader>
                  <CardContent>
                    {(d.rooms?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t('hostel.noRooms')}</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(d.rooms ?? []).map((r: Room) => (
                          <div key={r.id} className={cn('p-3 rounded-lg text-xs border', r.occupied >= r.capacity ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-muted/50')}>
                            <div className="text-center">
                              <DoorOpen className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                              <p className="font-medium">Room {r.roomNumber}</p>
                              <p className="text-muted-foreground">{r.occupied}/{r.capacity}</p>
                            </div>
                            {(r.occupants?.length ?? 0) > 0 && (
                              <div className="mt-2 space-y-1">
                                {(r.occupants ?? []).map((o: Occupant) => (
                                  <div key={o.id} className="group flex items-center justify-between gap-1 rounded bg-background/60 px-1.5 py-0.5">
                                    <span className="truncate text-[10px]">{o.name}</span>
                                    <button onClick={() => unassignStudent(o.id)} className="text-muted-foreground hover:text-red-500 shrink-0" aria-label="Remove student"><X className="w-3 h-3" /></button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}
    </div>
  )
}
