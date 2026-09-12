'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FadeIn } from '@/components/ui/animate'
import { Send, Megaphone, Trash2, Globe, Lock, Loader2, MessageSquare, AlertTriangle, Users, Mail } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmailTab } from './email-tab'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Paginator, pageHref } from '@/components/ui/paginator'

interface Announcement { id: string; title: string; content: string; isPublic: boolean; createdAt: string }
interface SmsLog { id: string; phone: string; message: string; status: string; createdAt: string }
interface SmsState { provider: string; configured: boolean; logs: SmsLog[]; total: number }

export function CommunicationsClient({
  announcements, classes, sms, pageSize, announcementsPage, announcementsTotal,
}: {
  announcements: Announcement[]
  classes: { id: string; name: string }[]
  sms: SmsState
  pageSize: number; announcementsPage: number; announcementsTotal: number
}) {
  const params = useSearchParams()
  const goAnnouncements = (p: number) => router.push(pageHref('/dashboard/communications', params.toString(), 'ap', p))
  // The server renders the first page of the SMS log; later pages come from GET /api/sms.
  const [logs, setLogs] = useState<{ items: SmsLog[]; page: number; total: number }>({ items: sms.logs, page: 1, total: sms.total })
  const loadLogs = async (p: number) => {
    try {
      const res = await fetch(`/api/sms?page=${p}`)
      if (!res.ok) return
      const d = await res.json()
      setLogs({ items: d.logs, page: d.page, total: d.total })
    } catch { toast.error('Could not load messages') }
  }
  const [smsText, setSmsText] = useState('')
  const [audience, setAudience] = useState<'all-guardians' | 'class-guardians' | 'one'>('all-guardians')
  const [smsClassId, setSmsClassId] = useState('')
  const [smsPhone, setSmsPhone] = useState('')
  const [smsBusy, setSmsBusy] = useState(false)
  const [preview, setPreview] = useState<{ recipients: number; reachable: number; unreachable: number; segments: number; totalSegments: number } | null>(null)

  // Reach and cost before spending anything.
  const refreshPreview = async (text: string, aud: string, cls: string) => {
    try {
      const res = await fetch('/api/sms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, audience: aud, classId: cls }),
      })
      if (res.ok) setPreview(await res.json())
    } catch { /* preview is advisory */ }
  }

  const sendSms = async () => {
    setSmsBusy(true)
    try {
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smsText, audience, classId: smsClassId || undefined, phone: smsPhone || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not send'); return }
      if (d.delivered > 0) {
        toast.success(`Sent to ${d.delivered} of ${d.requested} (${d.segments} segment(s))`)
      } else {
        toast.error(
          d.configured
            ? `Nothing was delivered — ${d.failures?.[0]?.error ?? 'the provider rejected the messages'}`
            : 'No SMS provider is configured, so nothing was sent.'
        )
      }
      setSmsText('')
      setPreview(null)
      router.refresh()
      loadLogs(1)
    } catch { toast.error('Something went wrong') } finally { setSmsBusy(false) }
  }

  const { t } = useI18n()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [saving, setSaving] = useState(false)

  const handlePost = async () => {
    if (!title.trim()) { toast.error('Please enter a title'); return }
    if (!content.trim()) { toast.error('Please enter a message'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, isPublic: visibility === 'public' }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Announcement posted')
      setTitle(''); setContent(''); router.refresh()
    } catch { toast.error('Something went wrong') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/announcements?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Announcement removed')
      router.refresh()
    } catch { toast.error('Something went wrong') }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.communications')}</h1>
          <p className="text-muted-foreground mt-1">Post announcements to the school notice board.</p>
        </div>
      </FadeIn>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board" className="gap-2"><Megaphone className="w-4 h-4" /> Notice board</TabsTrigger>
          <TabsTrigger value="sms" className="gap-2"><MessageSquare className="w-4 h-4" /> SMS to parents</TabsTrigger>
          <TabsTrigger value="email" className="gap-2"><Mail className="w-4 h-4" /> Email to parents</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="pt-4">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Send className="w-5 h-5" />New Announcement</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-term break" />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public (parents &amp; students)</SelectItem>
                  <SelectItem value="staff">Staff only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Type your announcement..." rows={6} />
            </div>
            <Button onClick={handlePost} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              Post Announcement
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" />Notice Board</CardTitle></CardHeader>
          <CardContent>
            {(announcements?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No announcements yet. Post one to get started.</p>
            ) : (
              <div className="space-y-3">
                {(announcements ?? []).map((a) => (
                  <div key={a.id} className="group p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{a.title}</h3>
                          <Badge variant={a.isPublic ? 'secondary' : 'outline'} className="text-[10px] gap-1">
                            {a.isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            {a.isPublic ? 'Public' : 'Staff'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.content}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-2">
                          {a.createdAt ? new Date(a.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(a.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Paginator page={announcementsPage} pageSize={pageSize} total={announcementsTotal} onPage={goAnnouncements} className="mt-3 px-0" />
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="email" className="pt-4"><EmailTab classes={classes} /></TabsContent>

        <TabsContent value="sms" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Send SMS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!sms.configured && (
                  <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 dark:text-amber-200">
                      <span className="font-medium">No SMS provider is configured.</span> Messages are written to
                      the server log instead of being delivered. Set <code>SMS_PROVIDER=nextsms</code> and your
                      NextSMS credentials to send for real.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Send to</Label>
                  <Select
                    value={audience}
                    onValueChange={(v: any) => { setAudience(v); refreshPreview(smsText, v, smsClassId) }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-guardians">All parents</SelectItem>
                      <SelectItem value="class-guardians">Parents of one class</SelectItem>
                      <SelectItem value="one">A single number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {audience === 'class-guardians' && (
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={smsClassId} onValueChange={(v: string) => { setSmsClassId(v); refreshPreview(smsText, audience, v) }}>
                      <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {audience === 'one' && (
                  <div className="space-y-2">
                    <Label>Phone number</Label>
                    <Input value={smsPhone} placeholder="0712 345 678" onChange={(e: any) => setSmsPhone(e.target.value)} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    rows={5}
                    value={smsText}
                    placeholder="Wazazi wapendwa, mkutano wa wazazi utafanyika Jumamosi saa 3 asubuhi."
                    onChange={(e: any) => { setSmsText(e.target.value); refreshPreview(e.target.value, audience, smsClassId) }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {smsText.length} characters
                    {preview ? ` · ${preview.segments} segment${preview.segments === 1 ? '' : 's'} each` : ''}
                  </p>
                </div>

                {preview && audience !== 'one' && (
                  <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5" /> {preview.reachable} of {preview.recipients} parents reachable
                    </p>
                    {preview.unreachable > 0 && (
                      <p className="text-muted-foreground">
                        {preview.unreachable} number{preview.unreachable === 1 ? '' : 's'} unusable and will be skipped
                      </p>
                    )}
                    <p className="text-muted-foreground">{preview.totalSegments} segment(s) will be charged</p>
                  </div>
                )}

                <Button
                  className="w-full gap-2"
                  disabled={smsBusy || !smsText.trim() || (audience === 'class-guardians' && !smsClassId) || (audience === 'one' && !smsPhone.trim())}
                  onClick={sendSms}
                >
                  {smsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {smsBusy ? 'Sending…' : 'Send SMS'}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" /> Recent messages
                  <Badge variant="outline" className="ml-1 text-xs">{sms.provider}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {logs.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No messages sent yet.</p>
                ) : (
                  <div className="space-y-2">
                    {logs.items.map((l) => (
                      <div key={l.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium font-mono">+{l.phone}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{l.message}</p>
                        </div>
                        <Badge variant={l.status === 'sent' ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                          {l.status === 'sent' ? 'Sent' : 'Failed'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <Paginator page={logs.page} pageSize={pageSize} total={logs.total} onPage={loadLogs} className="mt-3 px-0" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
