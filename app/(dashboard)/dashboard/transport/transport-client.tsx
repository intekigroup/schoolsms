'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { Bus, MapPin, Users, Plus, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'

interface RouteStudent { id: string; name: string }
interface Route { id: string; name: string; stops: string; fee: number; studentCount: number; vehicles: string[]; students: RouteStudent[] }
interface Vehicle { id: string; plateNumber: string; capacity: number; driverName: string }
interface StudentOpt { id: string; name: string; admissionNo: string; assigned: boolean }

export function TransportClient({ routes, vehicles, students }: { routes: Route[]; vehicles: Vehicle[]; students: StudentOpt[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [routeOpen, setRouteOpen] = useState(false)
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [routeForm, setRouteForm] = useState({ name: '', stops: '', fee: '' })
  const [vehicleForm, setVehicleForm] = useState({ plateNumber: '', capacity: '', driverName: '', driverPhone: '' })
  const [assignForm, setAssignForm] = useState({ studentId: '', routeId: '' })

  const assignStudent = async () => {
    if (!assignForm.studentId || !assignForm.routeId) { toast.error('Select a student and route'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/transport/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assignForm) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Student assigned to route')
      setAssignOpen(false); setAssignForm({ studentId: '', routeId: '' }); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  const unassignStudent = async (studentId: string) => {
    try {
      const res = await fetch(`/api/transport/assign?studentId=${studentId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove'); return }
      toast.success('Student removed from route')
      router.refresh()
    } catch { toast.error('Something went wrong') }
  }

  const addRoute = async () => {
    if (!routeForm.name) { toast.error('Route name is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'route', ...routeForm }) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Route added')
      setRouteOpen(false); setRouteForm({ name: '', stops: '', fee: '' }); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  const addVehicle = async () => {
    if (!vehicleForm.plateNumber) { toast.error('Plate number is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'vehicle', ...vehicleForm }) })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Vehicle added')
      setVehicleOpen(false); setVehicleForm({ plateNumber: '', capacity: '', driverName: '', driverPhone: '' }); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.transport')}</h1>
            <p className="text-muted-foreground mt-1">{t('transport.subtitle2')}</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild><Button variant="outline" className="gap-2" disabled={(routes?.length ?? 0) === 0}><UserPlus className="w-4 h-4" /> Assign Student</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('transport.assignStudent')}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label>{t('transport.student')}</Label>
                    <Select value={assignForm.studentId} onValueChange={(v: string) => setAssignForm({ ...assignForm, studentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>{(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo}){s.assigned ? ' • assigned' : ''}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('transport.route')}</Label>
                    <Select value={assignForm.routeId} onValueChange={(v: string) => setAssignForm({ ...assignForm, routeId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                      <SelectContent>{(routes ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button onClick={assignStudent} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Assign'}</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={vehicleOpen} onOpenChange={setVehicleOpen}>
              <DialogTrigger asChild><Button variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Vehicle</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('transport.addVehicle')}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>{t('transport.plate')}</Label><Input value={vehicleForm.plateNumber} onChange={(e: any) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} placeholder="T123 ABC" /></div>
                    <div className="space-y-2"><Label>{t('transport.capacity')}</Label><Input type="number" value={vehicleForm.capacity} onChange={(e: any) => setVehicleForm({ ...vehicleForm, capacity: e.target.value })} placeholder="40" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>{t('transport.driverName')}</Label><Input value={vehicleForm.driverName} onChange={(e: any) => setVehicleForm({ ...vehicleForm, driverName: e.target.value })} /></div>
                    <div className="space-y-2"><Label>{t('transport.driverPhone')}</Label><Input value={vehicleForm.driverPhone} onChange={(e: any) => setVehicleForm({ ...vehicleForm, driverPhone: e.target.value })} /></div>
                  </div>
                  <Button onClick={addVehicle} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Add Vehicle'}</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
              <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Route</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('transport.addRoute2')}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2"><Label>{t('transport.routeName')}</Label><Input value={routeForm.name} onChange={(e: any) => setRouteForm({ ...routeForm, name: e.target.value })} placeholder="e.g. Njiro – Sakina" /></div>
                  <div className="space-y-2"><Label>{t('transport.stops')}</Label><Input value={routeForm.stops} onChange={(e: any) => setRouteForm({ ...routeForm, stops: e.target.value })} placeholder="Njiro, Kaloleni, Sakina" /></div>
                  <div className="space-y-2"><Label>{t('transport.feePerTerm')}</Label><Input type="number" value={routeForm.fee} onChange={(e: any) => setRouteForm({ ...routeForm, fee: e.target.value })} placeholder="150000" /></div>
                  <Button onClick={addRoute} disabled={loading} className="w-full">{loading ? 'Saving...' : 'Add Route'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><MapPin className="w-5 h-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">{t('transport.routes')}</p><p className="text-xl font-bold font-mono">{routes?.length ?? 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Bus className="w-5 h-5 text-green-700 dark:text-green-400" /></div>
          <div><p className="text-xs text-muted-foreground">{t('transport.vehicles')}</p><p className="text-xl font-bold font-mono">{vehicles?.length ?? 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Users className="w-5 h-5 text-amber-700 dark:text-amber-400" /></div>
          <div><p className="text-xs text-muted-foreground">{t('transport.studentsOn')}</p><p className="text-xl font-bold font-mono">{(routes ?? []).reduce((s: number, r: Route) => s + (r.studentCount ?? 0), 0)}</p></div>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display font-semibold mb-3">{t('transport.routes')}</h2>
          {(routes?.length ?? 0) === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t('transport.noRoutes')}</CardContent></Card>
          ) : (
            <Stagger className="grid gap-4">
              {(routes ?? []).map((r: Route) => (
                <StaggerItem key={r.id}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />{r.name}</h3>
                        <span className="font-mono text-sm">TZS {(r.fee ?? 0).toLocaleString('en-US')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{r.stops || 'No stops listed'}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs"><Users className="w-3 h-3 mr-1" />{r.studentCount} students</Badge>
                        <div className="flex gap-1">
                          {(r.vehicles ?? []).map((v: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{v}</Badge>)}
                        </div>
                      </div>
                      {(r.students?.length ?? 0) > 0 && (
                        <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5">
                          {(r.students ?? []).map((s: RouteStudent) => (
                            <span key={s.id} className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                              {s.name}
                              <button onClick={() => unassignStudent(s.id)} className="text-muted-foreground hover:text-red-500" aria-label="Remove student"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
        <div>
          <h2 className="font-display font-semibold mb-3">{t('transport.vehicles')}</h2>
          {(vehicles?.length ?? 0) === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{t('transport.noVehicles')}</CardContent></Card>
          ) : (
            <Stagger className="grid gap-4">
              {(vehicles ?? []).map((v: Vehicle) => (
                <StaggerItem key={v.id}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2"><Bus className="w-4 h-4 text-green-600" />{v.plateNumber}</h3>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">{v.driverName || 'No driver'}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs"><Users className="w-3 h-3 mr-1" />{v.capacity} seats</Badge>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </div>
    </div>
  )
}
