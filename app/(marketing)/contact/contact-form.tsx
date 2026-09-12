'use client'

import { useState } from 'react'
import { Send, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TOPICS = [
  ['quote', 'I would like a quote'],
  ['demo', 'I would like a demo'],
  ['pricing', 'A question about pricing'],
  ['standalone', 'Standalone — install on our own server'],
  ['enterprise', 'Enterprise / multi-campus'],
  ['support', 'I already use Shule SMS'],
  ['other', 'Something else'],
] as const

const LEVELS = [
  ['NURSERY', 'Nursery'],
  ['PRIMARY', 'Primary (Std 1–7)'],
  ['O_LEVEL', 'O-level (Form 1–4)'],
  ['A_LEVEL', 'A-level (Form 5–6)'],
] as const

const VALID_TOPICS = new Set(TOPICS.map(([v]) => v))

export function ContactForm({ initialTopic }: { initialTopic?: string }) {
  const startTopic = initialTopic && VALID_TOPICS.has(initialTopic as any) ? initialTopic : 'demo'
  const [form, setForm] = useState({ name: '', email: '', phone: '', school: '', pupils: '', topic: startTopic, message: '' })
  const [levels, setLevels] = useState<string[]>([])
  const toggleLevel = (v: string) =>
    setLevels((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))
  // A quote needs pupils and levels; other topics do not.
  const quoting = form.topic === 'quote'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ delivered: boolean } | null>(null)

  const set = (k: keyof typeof form) => (e: any) => setForm({ ...form, [k]: e?.target ? e.target.value : e })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, levels }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? 'Could not send your message'); return }
      setDone({ delivered: Boolean(d?.delivered) })
    } catch {
      setError('Could not send your message. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-secondary" />
          <h2 className="font-display text-xl font-semibold">Thank you, {form.name.split(' ')[0]}.</h2>
        </div>
        <p className="mt-2 text-muted-foreground">
          We have your message about {form.school || 'your school'} and will reply to{' '}
          <span className="font-medium text-foreground">{form.email}</span> within one working day.
        </p>
        {!done.delivered && (
          <div className="mt-4 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-900 dark:text-amber-200">
              This installation has no email provider configured, so your message was recorded in the
              server log rather than delivered. If you are the operator, set <code>MAIL_TRANSPORT=smtp</code>.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="c-name">Your name</Label>
          <Input id="c-name" required value={form.name} onChange={set('name')} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="c-phone" value={form.phone} onChange={set('phone')} placeholder="0712 345 678" autoComplete="tel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-school">School</Label>
          <Input id="c-school" required value={form.school} onChange={set('school')} autoComplete="organization" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-pupils">Number of pupils <span className="font-normal text-muted-foreground">(roughly)</span></Label>
          <Input id="c-pupils" type="number" min={1} required={quoting} value={form.pupils} onChange={set('pupils')} placeholder="e.g. 450" />
        </div>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">
            Levels you teach{' '}
            <span className="font-normal text-muted-foreground">{quoting ? '(a quote depends on these)' : '(optional)'}</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEVELS.map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={levels.includes(v)} onChange={() => toggleLevel(v)} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label>Topic</Label>
          <Select value={form.topic} onValueChange={set('topic')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TOPICS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="c-message">Message</Label>
          <Textarea id="c-message" required rows={5} value={form.message} onChange={set('message')}
            placeholder={quoting ? 'Anything else that affects the quote — boarding, campuses, when the term starts.' : 'Tell us what you use today and what you need.'} />
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="mt-6 gap-2" disabled={busy || (quoting && levels.length === 0)}>
        <Send className="h-4 w-4" /> {busy ? 'Sending…' : quoting ? 'Request quote' : 'Send message'}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">We only use these details to reply to you.</p>
    </form>
  )
}
