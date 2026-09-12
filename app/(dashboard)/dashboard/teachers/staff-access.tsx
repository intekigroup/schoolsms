'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyRound, Copy, Plus, Trash2, RefreshCw, UserX } from 'lucide-react'
import { toast } from 'sonner'

/**
 * "Access & teaching" for one staff member: the portal login (create / reset /
 * remove) and the teaching load (class teacher of, subjects per class) that
 * scopes what the teacher sees.
 */
export interface StaffAccessTarget { id: string; name: string; role: string; loginEmail: string | null; loginRole: string | null }

export function StaffAccessDialog({ target, onClose, classes, subjects }: {
  target: StaffAccessTarget | null; onClose: () => void
  classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('TEACHER')
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [load, setLoad] = useState<{ classTeacherOf: { id: string; name: string } | null; assignments: { id: string; subject: string; className: string }[] } | null>(null)
  const [pick, setPick] = useState({ subjectId: '', classId: 'ALL' })

  useEffect(() => {
    if (!target) return
    setCreds(null); setEmail(''); setLoad(null)
    setRole(/account|bursar|finance/i.test(target.role) ? 'ACCOUNTANT' : /librar/i.test(target.role) ? 'LIBRARIAN' : 'TEACHER')
    fetch(`/api/teachers/assignments?staffId=${target.id}`).then((r) => r.json()).then(setLoad).catch(() => {})
  }, [target])
  if (!target) return null

  const call = async (path: string, init: RequestInit) => {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json' } })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d?.error ?? 'Request failed')
    return d
  }
  const reloadLoad = () => fetch(`/api/teachers/assignments?staffId=${target.id}`).then((r) => r.json()).then(setLoad)
  const createLogin = async () => {
    setBusy(true)
    try { const d = await call('/api/teachers/account', { method: 'POST', body: JSON.stringify({ staffId: target.id, email: email || undefined, role }) }); setCreds({ email: d.email, password: d.password }); toast.success('Login created'); router.refresh() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const resetLogin = async () => {
    if (!window.confirm('Reset this password? The current one stops working immediately.')) return
    setBusy(true)
    try { const d = await call('/api/teachers/account', { method: 'PUT', body: JSON.stringify({ staffId: target.id }) }); setCreds({ email: d.email, password: d.password }); toast.success('Password reset') } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const removeLogin = async () => {
    if (!window.confirm('Remove this login? They will be signed out and unable to sign in.')) return
    setBusy(true)
    try { await call(`/api/teachers/account?staffId=${target.id}`, { method: 'DELETE' }); toast.success('Login removed'); router.refresh(); onClose() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const setClassTeacher = async (classId: string) => {
    try { await call('/api/teachers/assignments', { method: 'PATCH', body: JSON.stringify({ staffId: target.id, classTeacherOf: classId === 'NONE' ? null : classId }) }); await reloadLoad(); router.refresh() } catch (e: any) { toast.error(e.message) }
  }
  const addAssignment = async () => {
    try { await call('/api/teachers/assignments', { method: 'POST', body: JSON.stringify({ staffId: target.id, subjectId: pick.subjectId, classId: pick.classId === 'ALL' ? null : pick.classId }) }); await reloadLoad(); router.refresh() } catch (e: any) { toast.error(e.message) }
  }
  const removeAssignment = async (id: string) => { try { await call(`/api/teachers/assignments?id=${id}`, { method: 'DELETE' }); await reloadLoad(); router.refresh() } catch (e: any) { toast.error(e.message) } }
  const copy = () => { if (creds) navigator.clipboard?.writeText(`Email: ${creds.email}\nPassword: ${creds.password}`).then(() => toast.success('Copied')) }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{target.name} — access & teaching</DialogTitle></DialogHeader>

        <section className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium flex items-center gap-2"><KeyRound className="w-4 h-4" /> Portal login</p>
          {creds ? (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <p className="text-xs text-muted-foreground">Hand these over now — the password is shown only once.</p>
              <p className="font-mono">Email: {creds.email}</p>
              <p className="font-mono">Password: {creds.password}</p>
              <Button size="sm" variant="outline" className="gap-1 mt-1" onClick={copy}><Copy className="w-3 h-3" /> Copy</Button>
            </div>
          ) : target.loginEmail ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="default">Active</Badge><span className="font-mono">{target.loginEmail}</span><span className="text-xs text-muted-foreground">{target.loginRole}</span>
              <span className="flex-1" />
              <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={resetLogin}><RefreshCw className="w-3 h-3" /> Reset password</Button>
              <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={busy} onClick={removeLogin}><UserX className="w-3 h-3" /> Remove</Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto] sm:items-end">
              <div className="space-y-1"><Label className="text-xs">Email (blank = employee number @staff.local)</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.tz" /></div>
              <div className="space-y-1"><Label className="text-xs">Portal role</Label>
                <Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TEACHER">Teacher</SelectItem><SelectItem value="ACCOUNTANT">Accountant</SelectItem><SelectItem value="LIBRARIAN">Librarian</SelectItem></SelectContent></Select></div>
              <Button size="sm" disabled={busy} onClick={createLogin}>{busy ? 'Creating…' : 'Create login'}</Button>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Teaching load</p>
          <p className="text-xs text-muted-foreground">Decides which classes, pupils, registers and mark sheets this teacher sees. A class teacher sees everything for their class.</p>
          <div className="space-y-1">
            <Label className="text-xs">Class teacher of</Label>
            <Select value={load?.classTeacherOf?.id ?? 'NONE'} onValueChange={setClassTeacher}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="NONE">— none —</SelectItem>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subjects taught</Label>
            {load?.assignments.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            {load?.assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm rounded bg-muted/50 px-2 py-1">
                <span>{a.subject} <span className="text-muted-foreground">· {a.className}</span></span>
                <Button variant="ghost" size="icon-sm" onClick={() => removeAssignment(a.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] pt-1">
              <Select value={pick.subjectId} onValueChange={(v) => setPick({ ...pick, subjectId: v })}><SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger><SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
              <Select value={pick.classId} onValueChange={(v) => setPick({ ...pick, classId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All classes</SelectItem>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              <Button size="sm" className="gap-1" disabled={!pick.subjectId} onClick={addAssignment}><Plus className="w-4 h-4" /> Add</Button>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
