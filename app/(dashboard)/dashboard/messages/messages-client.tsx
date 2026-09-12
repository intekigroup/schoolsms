'use client'

import { useI18n } from '@/lib/i18n-context'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, MessagesSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Conversation { userId: string; name: string; role: string; studentId: string; studentName: string; className: string | null; last: string; lastAt: string; lastMine: boolean; unread: number }
interface Contact { userId: string; name: string; role: string; studentId: string; studentName: string; className: string | null; relation: string }
interface Msg { id: string; body: string; createdAt: string; mine: boolean; senderName: string; senderRole: string; readAt: string | null; viaSms?: boolean; viaEmail?: boolean; delivery?: string | null }

const when = (d: string) => { const x = new Date(d); const today = new Date().toDateString() === x.toDateString(); return today ? x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

export function MessagesClient({ me, role, initial }: { me: string; role: string; initial: { userId: string; studentId: string } | null }) {
  const { t } = useI18n()
  const [convos, setConvos] = useState<Conversation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [active, setActive] = useState<{ userId: string; studentId: string; name: string; studentName: string } | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [composing, setComposing] = useState(false)
  const [pick, setPick] = useState('')
  const [search, setSearch] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  void me

  const loadList = useCallback(async () => {
    const r = await fetch('/api/messages'); const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error(d?.error ?? 'Could not load'); return }
    setConvos(d.conversations ?? []); setContacts(d.contacts ?? [])
    if (initial && !active) {
      const c = (d.contacts as Contact[]).find((x) => x.userId === initial.userId && x.studentId === initial.studentId)
      if (c) setActive({ userId: c.userId, studentId: c.studentId, name: c.name, studentName: c.studentName })
    }
  }, [initial, active])
  const loadThread = useCallback(async () => {
    if (!active) return
    const r = await fetch(`/api/messages?with=${active.userId}&studentId=${active.studentId}`); const d = await r.json().catch(() => ({}))
    if (r.ok) { setThread(d.messages ?? []); setConvos((c) => c.map((x) => (x.userId === active.userId && x.studentId === active.studentId ? { ...x, unread: 0 } : x))) }
  }, [active])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { loadThread(); const t = setInterval(loadThread, 15000); return () => clearInterval(t) }, [loadThread])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [thread])

  const [alsoSms, setAlsoSms] = useState(false)
  const [alsoEmail, setAlsoEmail] = useState(false)
  const send = async () => {
    if (!active || !text.trim()) return
    setSending(true)
    try {
      const r = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: active.studentId, recipientId: active.userId, body: text.trim(), sms: alsoSms, email: alsoEmail }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Could not send'); return }
      setText(''); await loadThread(); loadList()
    } finally { setSending(false) }
  }
  const startNew = () => {
    const c = contacts.find((x) => `${x.userId}:${x.studentId}` === pick)
    if (!c) return
    setActive({ userId: c.userId, studentId: c.studentId, name: c.name, studentName: c.studentName }); setComposing(false); setPick('')
  }
  const filtered = convos.filter((c) => `${c.name} ${c.studentName}`.toLowerCase().includes(search.toLowerCase()))
  const totalUnread = convos.reduce((s, c) => s + c.unread, 0)

  return (
    <div className="space-y-4">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Messages{totalUnread ? <Badge className="ml-2 align-middle">{totalUnread} new</Badge> : null}</h1>
            <p className="text-muted-foreground mt-1">{role === 'PARENT' ? 'Write to your child’s teachers or the school office.' : 'Write to the parents and guardians of the pupils you teach. Every conversation is about one pupil.'}</p>
          </div>
          <Button className="gap-1.5" onClick={() => setComposing(true)} disabled={contacts.length === 0}><Plus className="h-4 w-4" /> New message</Button>
        </div>
      </FadeIn>
      {contacts.length === 0 && <p className="text-sm text-muted-foreground">{role === 'PARENT' ? 'No teachers with portal logins are linked to your children yet.' : 'None of your pupils’ guardians have a portal login yet — the office creates those under Parents.'}</p>}

      {composing && (
        <Card><CardContent className="flex flex-wrap items-end gap-2 p-4">
          <div className="flex-1 min-w-[260px] space-y-1"><p className="text-xs text-muted-foreground">To</p>
            <Select value={pick} onValueChange={setPick}><SelectTrigger><SelectValue placeholder={t('messages.pick')} /></SelectTrigger><SelectContent>{contacts.map((c) => <SelectItem key={`${c.userId}:${c.studentId}`} value={`${c.userId}:${c.studentId}`}>{c.name} · {c.relation} · about {c.studentName}{c.className ? ` (${c.className})` : ''}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={startNew} disabled={!pick}>{t('messages.open')}</Button><Button variant="ghost" onClick={() => setComposing(false)}>{t('common.cancel')}</Button>
        </CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardContent className="p-2 space-y-1">
            <Input placeholder={t('messages.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 mb-1" />
            {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{t('messages.noConversations')}</p>}
            {filtered.map((c) => (
              <button key={`${c.userId}:${c.studentId}`} type="button" onClick={() => setActive({ userId: c.userId, studentId: c.studentId, name: c.name, studentName: c.studentName })}
                className={cn('w-full rounded-md px-3 py-2 text-left hover:bg-muted/60', active?.userId === c.userId && active?.studentId === c.studentId && 'bg-muted')}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{c.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{when(c.lastAt)}</span></div>
                <p className="truncate text-xs text-muted-foreground">about {c.studentName}{c.className ? ` · ${c.className}` : ''}</p>
                <div className="flex items-center justify-between gap-2"><p className="truncate text-xs">{c.lastMine ? 'You: ' : ''}{c.last}</p>{c.unread > 0 && <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{c.unread}</Badge>}</div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="flex min-h-[420px] flex-col">
          {active ? (
            <>
              <div className="border-b px-4 py-2"><p className="text-sm font-medium">{active.name}</p><p className="text-xs text-muted-foreground">about {active.studentName}</p></div>
              <CardContent className="flex-1 space-y-2 overflow-y-auto p-4 max-h-[50vh]">
                {thread.length === 0 && <p className="text-center text-xs text-muted-foreground">{t('messages.noMessages')}</p>}
                {thread.map((m) => (
                  <div key={m.id} className={cn('max-w-[80%] rounded-lg px-3 py-2 text-sm', m.mine ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={cn('mt-1 text-[10px]', m.mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{m.mine ? 'You' : m.senderName} · {when(m.createdAt)}{m.mine && m.readAt ? ' · read' : ''}{m.viaSms ? ' · SMS' : ''}{m.viaEmail ? ' · email' : ''}</p>{m.mine && m.delivery ? <p className="text-[10px] text-primary-foreground/60">{m.delivery}</p> : null}
                  </div>
                ))}
                <div ref={bottom} />
              </CardContent>
              <div className="flex items-end gap-2 border-t p-3">
                <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('messages.write')} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
                {role !== 'PARENT' && (
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={alsoSms} onChange={(e) => setAlsoSms(e.target.checked)} /> Also send as SMS to the guardian's phone</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} /> Also email</label>
                  </div>
                )}
                <Button onClick={send} disabled={sending || !text.trim()} className="gap-1"><Send className="h-4 w-4" /> Send</Button>
              </div>
            </>
          ) : (
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground"><MessagesSquare className="h-8 w-8 opacity-40" /><p className="text-sm">{t('messages.pickConversation')}</p></CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
