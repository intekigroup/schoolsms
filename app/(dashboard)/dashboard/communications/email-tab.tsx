'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { AlertTriangle, Mail, Send } from 'lucide-react'

/** Email to parents — the audience is derived server-side from the school's pupils, like SMS. */
export function EmailTab({ classes }: { classes: { id: string; name: string }[] }) {
  const [audience, setAudience] = useState<'all-guardians' | 'class-guardians' | 'one'>('all-guardians')
  const [classId, setClassId] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<{ configured: boolean; log: { id: string; to: string; subject: string | null; status: string; createdAt: string }[] } | null>(null)
  const [preview, setPreview] = useState<{ recipients: number; missing: number } | null>(null)

  const refresh = () => fetch('/api/email').then((r) => r.json()).then(setState).catch(() => {})
  useEffect(() => { refresh() }, [])
  const previewNow = async (aud = audience, cls = classId) => {
    if (aud === 'one') { setPreview(null); return }
    const r = await fetch('/api/email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audience: aud, classId: cls || undefined }) })
    setPreview(r.ok ? await r.json() : null)
  }
  useEffect(() => { previewNow() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  const send = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, text, audience, classId: classId || undefined, email: email || undefined }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Could not send'); return }
      toast.success(`${d.delivered} of ${d.requested} email(s) accepted${d.missing ? ` · ${d.missing} guardian(s) have no address` : ''}${d.failed ? ` · ${d.failed} failed` : ''}`)
      setSubject(''); setText(''); refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Email to parents</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {state && !state.configured && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>No mail server is configured on this installation, so emails will be logged but not delivered.</p></div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Send to</Label>
              <Select value={audience} onValueChange={(v: any) => { setAudience(v); previewNow(v, classId) }}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all-guardians">All parents and guardians</SelectItem><SelectItem value="class-guardians">Parents of one class</SelectItem><SelectItem value="one">One address</SelectItem></SelectContent></Select>
            </div>
            {audience === 'class-guardians' && (
              <div className="space-y-1.5"><Label>Class</Label>
                <Select value={classId} onValueChange={(v) => { setClassId(v); previewNow(audience, v) }}><SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger><SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            {audience === 'one' && <div className="space-y-1.5"><Label>Email address</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" /></div>}
          </div>
          <div className="space-y-1.5"><Label>Subject</Label><Input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Term 2 closing date" /></div>
          <div className="space-y-1.5"><Label>Message</Label><Textarea rows={6} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} placeholder="Dear parents, …" /></div>
          {preview && audience !== 'one' && <p className="text-xs text-muted-foreground">{preview.recipients} guardian(s) with an email address will receive this{preview.missing ? `; ${preview.missing} have no address on record and will be skipped (use SMS for them)` : ''}.</p>}
          <Button onClick={send} disabled={busy || subject.trim().length < 2 || text.trim().length < 2 || (audience === 'class-guardians' && !classId) || (audience === 'one' && !email.trim())} className="gap-2"><Send className="h-4 w-4" /> {busy ? 'Sending…' : 'Send email'}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent emails</CardTitle></CardHeader>
        <CardContent>
          {!state?.log.length ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
            <ul className="space-y-2 text-xs">{state.log.map((l) => <li key={l.id} className="flex justify-between gap-2 border-b pb-1.5"><span className="min-w-0"><span className="block truncate font-medium">{l.subject ?? '—'}</span><span className="block truncate text-muted-foreground">{l.to}</span></span><span className={l.status === 'sent' ? 'text-emerald-600' : 'text-red-600'}>{l.status === 'sent' ? 'sent' : 'failed'}</span></li>)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
