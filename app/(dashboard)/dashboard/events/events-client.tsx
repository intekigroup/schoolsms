'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { Calendar, Plus, MapPin, Clock, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface EventItem { id: string; title: string; description: string; startDate: string; endDate: string; location: string }

export function EventsClient({ events }: { events: EventItem[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '', location: '' })
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Event created')
      setDialogOpen(false)
      setForm({ title: '', description: '', startDate: '', endDate: '', location: '' })
      router.refresh()
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/events?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Event deleted')
      router.refresh()
    } catch { toast.error('Error') } finally { setDeleting(null) }
  }

  const upcoming = (events ?? []).filter(e => new Date(e.startDate) >= new Date())
  const past = (events ?? []).filter(e => new Date(e.startDate) < new Date())

  const renderCard = (e: EventItem) => (
    <StaggerItem key={e.id}>
      <Card className="hover:shadow-md transition-shadow group relative">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold mb-2">{e.title}</h3>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
              onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          {e.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{e.description}</p>}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {e.startDate && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(e.startDate).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                {e.endDate && <> — {new Date(e.endDate).toLocaleDateString('en-US', { dateStyle: 'medium' })}</>}
              </span>
            )}
            {e.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </StaggerItem>
  )

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.events')}</h1>
            <p className="text-muted-foreground mt-1">{t('events.subtitle2')}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add Event</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('events.create')}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>{t('common.title')}</Label><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t('common.description')}</Label><Textarea value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t('events.startDate')}</Label><Input type="datetime-local" value={form.startDate} onChange={(e: any) => setForm({ ...form, startDate: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t('events.endDate')}</Label><Input type="datetime-local" value={form.endDate} onChange={(e: any) => setForm({ ...form, endDate: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>{t('events.location')}</Label><Input value={form.location} onChange={(e: any) => setForm({ ...form, location: e.target.value })} /></div>
                <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? 'Creating...' : 'Create Event'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </FadeIn>

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Upcoming Events</h2>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(renderCard)}
          </Stagger>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg text-muted-foreground">{t('events.past')}</h2>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map(renderCard)}
          </Stagger>
        </div>
      )}

      {(events ?? []).length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('events.noEvents2')}</CardContent></Card>
      )}
    </div>
  )
}
