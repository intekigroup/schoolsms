'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FadeIn } from '@/components/ui/animate'
import {
  Users, Plus, Search, Download, Upload, UserPlus, Pencil, Trash2, KeyRound, Copy, FileDown,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { StudentImportDialog } from './import-dialog'

interface Student {
  siblings?: { id: string; name: string; className: string | null }[]
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  gender: string
  dateOfBirth: string
  className: string
  classId: string
  status: string
  loginEmail: string | null
}

export function StudentsClient({ students, classes, page, pageSize, total, query, readOnly = false, classId = '', groupByClass = false }: {
  readOnly?: boolean
  students: Student[]
  classes: { id: string; name: string }[]
  page: number
  pageSize: number
  total: number
  query: string
  classId?: string
  /** Teachers: rows are grouped under a heading per class. */
  groupByClass?: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()
  // Search runs on the server so it covers every student, not just this page.
  const [search, setSearch] = useState(query)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const [classPick, setClassPick] = useState(classId || 'ALL')
  const go = (p: number, q: string = search, cls: string = classPick) => {
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (cls && cls !== 'ALL') sp.set('classId', cls)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    router.push(qs ? '/dashboard/students?' + qs : '/dashboard/students')
  }
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: 'MALE', dateOfBirth: '', classId: '', admissionNo: '' })
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', firstName: '', lastName: '', gender: 'MALE', dateOfBirth: '', classId: '', admissionNo: '', status: 'ACTIVE' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [accountBusy, setAccountBusy] = useState<string | null>(null)
  // Shown once, right after creation — the office writes it down and hands it over.
  const [newLogin, setNewLogin] = useState<{ name: string; email: string; password: string } | null>(null)

  const createLogin = async (st: Student) => {
    setAccountBusy(st.id)
    try {
      const res = await fetch('/api/students/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: st.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not create the login'); return }
      setNewLogin({ name: `${st.firstName} ${st.lastName}`, email: d.email, password: d.password })
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setAccountBusy(null) }
  }

  const removeLogin = async (st: Student) => {
    if (!window.confirm(`Remove the login for ${st.firstName} ${st.lastName}? They will be signed out and cannot sign in again.`)) return
    setAccountBusy(st.id)
    try {
      const res = await fetch(`/api/students/account?studentId=${st.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not remove the login'); return }
      toast.success('Login removed')
      router.refresh()
    } catch { toast.error('Something went wrong') } finally { setAccountBusy(null) }
  }

  // Search is applied server-side; the status filter narrows the loaded page.
  const filtered = (students ?? []).filter(
    (s: Student) => statusFilter === 'ALL' || s.status === statusFilter
  )

  const handleAdd = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d?.error ?? 'Failed to add student')
        return
      }
      toast.success('Student added successfully')
      setDialogOpen(false)
      setForm({ firstName: '', lastName: '', gender: 'MALE', dateOfBirth: '', classId: '', admissionNo: '' })
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (s: Student) => {
    setEditForm({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      gender: s.gender || 'MALE',
      dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : '',
      classId: s.classId || '',
      admissionNo: s.admissionNo,
      status: s.status || 'ACTIVE',
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    setEditLoading(true)
    try {
      const res = await fetch('/api/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d?.error ?? 'Failed to update student')
        return
      }
      toast.success('Student updated')
      setEditOpen(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setEditLoading(false)
    }
  }

  const handleDelete = async (s: Student) => {
    if (!window.confirm(`Delete ${s.firstName} ${s.lastName}? This cannot be undone.`)) return
    setDeletingId(s.id)
    try {
      const res = await fetch(`/api/students?id=${s.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(d?.error ?? 'Failed to delete student')
        return
      }
      toast.success('Student deleted')
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setDeletingId(null)
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'ACTIVE': return 'default'
      case 'GRADUATED': return 'secondary'
      case 'SUSPENDED': return 'destructive'
      default: return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.students')}</h1>
            <p className="text-muted-foreground mt-1">{readOnly ? t('students.subtitleTeacher') : t('students.subtitle')}</p>
          </div>
          {!readOnly && <div className="flex flex-wrap gap-2"><StudentImportDialog /><Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><UserPlus className="w-4 h-4" /> {t('students.add')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('students.add')}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.firstName')}</Label>
                    <Input value={form.firstName} onChange={(e: any) => setForm({ ...form, firstName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common.lastName')}</Label>
                    <Input value={form.lastName} onChange={(e: any) => setForm({ ...form, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('common.admissionNo')}</Label>
                  <Input value={form.admissionNo} onChange={(e: any) => setForm({ ...form, admissionNo: e.target.value })} placeholder="e.g. KA-2026-001" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.gender')}</Label>
                    <Select value={form.gender} onValueChange={(v: string) => setForm({ ...form, gender: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">{t('common.male')}</SelectItem>
                        <SelectItem value="FEMALE">{t('common.female')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common.dateOfBirth')}</Label>
                    <Input type="date" value={form.dateOfBirth} onChange={(e: any) => setForm({ ...form, dateOfBirth: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('common.class')}</Label>
                  <Select value={form.classId} onValueChange={(v: string) => setForm({ ...form, classId: v })}>
                    <SelectTrigger><SelectValue placeholder={t('attendance.selectClassPh')} /></SelectTrigger>
                    <SelectContent>
                      {(classes ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAdd} disabled={loading} className="w-full">
                  {loading ? t('students.adding') : t('students.add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog></div>}
        </div>
      </FadeIn>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('students.searchPlaceholder')}
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') go(1) }}
            onBlur={() => { if (search.trim() !== query) go(1) }}
            className="pl-10"
          />
        </div>
        <Select value={classPick} onValueChange={(v) => { setClassPick(v); go(1, search, v) }}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder={t('common.allClasses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{groupByClass ? t('students.allMyClasses') : t('common.allClasses')}</SelectItem>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('students.allStatus')}</SelectItem>
            <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
            <SelectItem value="GRADUATED">{t('students.graduated')}</SelectItem>
            <SelectItem value="TRANSFERRED">{t('students.transferred')}</SelectItem>
            <SelectItem value="SUSPENDED">{t('students.suspended')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">{t('common.admissionNo')}</th>
                  <th className="text-left p-3 font-medium">{t('common.name')}</th>
                  <th className="text-left p-3 font-medium">{t('common.gender')}</th>
                  <th className="text-left p-3 font-medium">{t('common.class')}</th>
                  <th className="text-left p-3 font-medium">{t('common.status')}</th>
                  <th className="text-left p-3 font-medium">{t('common.portalLogin')}</th>
                  <th className="text-right p-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{groupByClass && classes.length === 0 ? 'No classes on your teaching load yet — ask the office to assign your classes under Teachers & Staff → Access & teaching.' : 'No students found'}</td></tr>
                ) : (
                  filtered.map((s: Student, i: number) => (
                    <Fragment key={s.id}>
                    {groupByClass && (i === 0 || filtered[i - 1].className !== s.className) && (
                      <tr className="bg-muted/40"><td colSpan={7} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.className} <span className="ml-1 font-normal normal-case">· {filtered.filter((x) => x.className === s.className).length} pupils</span></td></tr>
                    )}
                    <tr className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{s.admissionNo}</td>
                      <td className="p-3 font-medium">{s.firstName} {s.lastName}{(s.siblings?.length ?? 0) > 0 && <span className="ml-1.5 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-normal text-violet-800" title={s.siblings!.map((x) => `${x.name}${x.className ? ` (${x.className})` : ''}`).join(', ')}>{t('students.siblings', { n: s.siblings!.length })}</span>}</td>
                      <td className="p-3">{s.gender === 'MALE' ? t('common.male') : s.gender === 'FEMALE' ? t('common.female') : s.gender}</td>
                      <td className="p-3">{s.className}</td>
                      <td className="p-3">
                        <Badge variant={statusColor(s.status) as any} className="text-xs">{({ ACTIVE: t('common.active'), GRADUATED: t('students.graduated'), TRANSFERRED: t('students.transferred'), SUSPENDED: t('students.suspended') } as Record<string, string>)[s.status] ?? s.status}</Badge>
                      </td>
                      <td className="p-3">
                        {readOnly ? <span className="text-xs text-muted-foreground">{s.loginEmail ? 'Has login' : '—'}</span> : s.loginEmail ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs gap-1">
                              <KeyRound className="h-3 w-3" /> Active
                            </Badge>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                              disabled={accountBusy === s.id}
                              onClick={() => removeLogin(s)}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <Button
                            variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                            disabled={accountBusy === s.id}
                            onClick={() => createLogin(s)}
                          >
                            <KeyRound className="h-3 w-3" />
                            {accountBusy === s.id ? t('students.creating') : t('students.createLogin')}
                          </Button>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={`Report card for ${s.firstName} ${s.lastName}`}>
                            <a href={`/api/reports/report-card?studentId=${s.id}`}>
                              <FileDown className="h-4 w-4" />
                            </a>
                          </Button>
                          {!readOnly && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>}
                          {!readOnly && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(s)} disabled={deletingId === s.id} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>}
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('students.editStudent')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.firstName')}</Label>
                <Input value={editForm.firstName} onChange={(e: any) => setEditForm({ ...editForm, firstName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('common.lastName')}</Label>
                <Input value={editForm.lastName} onChange={(e: any) => setEditForm({ ...editForm, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('common.admissionNo')}</Label>
              <Input value={editForm.admissionNo} onChange={(e: any) => setEditForm({ ...editForm, admissionNo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.gender')}</Label>
                <Select value={editForm.gender} onValueChange={(v: string) => setEditForm({ ...editForm, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">{t('common.male')}</SelectItem>
                    <SelectItem value="FEMALE">{t('common.female')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('common.dateOfBirth')}</Label>
                <Input type="date" value={editForm.dateOfBirth} onChange={(e: any) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.class')}</Label>
                <Select value={editForm.classId} onValueChange={(v: string) => setEditForm({ ...editForm, classId: v })}>
                  <SelectTrigger><SelectValue placeholder={t('attendance.selectClassPh')} /></SelectTrigger>
                  <SelectContent>
                    {(classes ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('common.status')}</Label>
                <Select value={editForm.status} onValueChange={(v: string) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
                    <SelectItem value="GRADUATED">{t('students.graduated')}</SelectItem>
                    <SelectItem value="TRANSFERRED">{t('students.transferred')}</SelectItem>
                    <SelectItem value="SUSPENDED">{t('students.suspended')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleEdit} disabled={editLoading} className="w-full">
              {editLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The temporary password is readable exactly once. */}
      <Dialog open={Boolean(newLogin)} onOpenChange={(o: boolean) => { if (!o) setNewLogin(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Login created for {newLogin?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Write this down now — the password cannot be shown again. The student should change it
              after signing in.
            </p>
            <div className="rounded-md bg-muted p-3 space-y-2 font-mono text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs">{t('common.email')}</span>
                <span className="truncate">{newLogin?.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs">{t('auth.password')}</span>
                <span>{newLogin?.password}</span>
              </div>
            </div>
            <Button
              variant="outline" className="w-full gap-2"
              onClick={() => {
                navigator.clipboard?.writeText(`${newLogin?.email} / ${newLogin?.password}`)
                toast.success('Copied')
              }}
            >
              <Copy className="h-4 w-4" /> Copy both
            </Button>
            <Button className="w-full" onClick={() => setNewLogin(null)}>{t('common.done')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pagination — the table holds one page, not the whole school. */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'No students match'
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          {query ? ` for “${query}”` : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => go(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
