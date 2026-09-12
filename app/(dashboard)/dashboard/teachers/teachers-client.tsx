'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FadeIn } from '@/components/ui/animate'
import { UserPlus, Search, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { StaffAccessDialog, type StaffAccessTarget } from './staff-access'
import { KeyRound } from 'lucide-react'
import { Paginator, pageHref } from '@/components/ui/paginator'

interface StaffMember {
  id: string; employeeNo: string; firstName: string; lastName: string;
  gender: string; role: string; phone: string; qualification: string;
  status: string; salary: number;
  loginEmail: string | null; loginRole: string | null; classTeacherOf: string | null; subjectCount: number;
}

export function TeachersClient({ staff, classes, subjects, page, pageSize, total, query = '' }: { staff: StaffMember[]; classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]; page: number; pageSize: number; total: number; query?: string }) {
  const [access, setAccess] = useState<StaffAccessTarget | null>(null)
  const { t } = useI18n()
  const router = useRouter()
  // Search and paging run on the server so they cover every staff member, not just this page.
  const [search, setSearch] = useState(query)
  const go = (p: number, q: string = search) => {
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    router.push(pageHref('/dashboard/teachers', sp, 'page', p))
  }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: 'MALE', employeeNo: '', role: 'Teacher', phone: '', salary: '' })
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', firstName: '', lastName: '', gender: 'MALE', employeeNo: '', role: 'Teacher', phone: '', salary: '', status: 'ACTIVE' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, salary: parseFloat(form.salary) || 0 }),
      })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Staff added')
      setDialogOpen(false)
      router.refresh()
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const openEdit = (s: StaffMember) => {
    setEditForm({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      gender: s.gender || 'MALE',
      employeeNo: s.employeeNo,
      role: s.role || 'Teacher',
      phone: s.phone || '',
      salary: String(s.salary ?? ''),
      status: s.status || 'ACTIVE',
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    setEditLoading(true)
    try {
      const res = await fetch('/api/teachers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, salary: parseFloat(editForm.salary) || 0 }),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d?.error ?? 'Failed to update'); return }
      toast.success('Staff updated')
      setEditOpen(false)
      router.refresh()
    } catch { toast.error('Error') } finally { setEditLoading(false) }
  }

  const handleDelete = async (s: StaffMember) => {
    if (!window.confirm(`Delete ${s.firstName} ${s.lastName}? This cannot be undone.`)) return
    setDeletingId(s.id)
    try {
      const res = await fetch(`/api/teachers?id=${s.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Failed to delete'); return }
      toast.success('Staff deleted')
      router.refresh()
    } catch { toast.error('Error') } finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.teachers')}</h1>
            <p className="text-muted-foreground mt-1">Manage teachers, staff, and payroll.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><UserPlus className="w-4 h-4" /> Add Staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>First Name</Label><Input value={form.firstName} onChange={(e: any) => setForm({ ...form, firstName: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Last Name</Label><Input value={form.lastName} onChange={(e: any) => setForm({ ...form, lastName: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Employee No</Label><Input value={form.employeeNo} onChange={(e: any) => setForm({ ...form, employeeNo: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v: string) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Teacher">Teacher</SelectItem>
                        <SelectItem value="Accountant">Accountant</SelectItem>
                        <SelectItem value="Librarian">Librarian</SelectItem>
                        <SelectItem value="Security">Security</SelectItem>
                        <SelectItem value="Cleaner">Cleaner</SelectItem>
                        <SelectItem value="Driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Salary (TZS)</Label><Input type="number" value={form.salary} onChange={(e: any) => setForm({ ...form, salary: e.target.value })} /></div>
                </div>
                <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? 'Adding...' : 'Add Staff'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </FadeIn>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search staff..." value={search} onChange={(e: any) => setSearch(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') go(1) }} onBlur={() => { if (search.trim() !== query) go(1) }} className="pl-10 max-w-md" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Employee No</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Gender</th>
                <th className="text-left p-3 font-medium">Salary</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Login · Teaching</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {(staff ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No staff found</td></tr>
                ) : (staff ?? []).map((s: StaffMember) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{s.employeeNo}</td>
                    <td className="p-3 font-medium">{s.firstName} {s.lastName}</td>
                    <td className="p-3">{s.role}</td>
                    <td className="p-3">{s.gender}</td>
                    <td className="p-3 font-mono">TZS {(s.salary ?? 0).toLocaleString('en-US')}</td>
                    <td className="p-3"><Badge variant={s.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">{s.status}</Badge></td>
                    <td className="p-3">
                      <button type="button" className="text-left text-xs hover:underline" onClick={() => setAccess({ id: s.id, name: `${s.firstName} ${s.lastName}`, role: s.role, loginEmail: s.loginEmail, loginRole: s.loginRole })}>
                        {s.loginEmail ? <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> {s.loginEmail}</span> : <span className="text-muted-foreground">No login</span>}
                        <span className="block text-muted-foreground">{s.classTeacherOf ? `Class teacher · ${s.classTeacherOf}` : ''}{s.classTeacherOf && s.subjectCount ? ' · ' : ''}{s.subjectCount ? `${s.subjectCount} subject${s.subjectCount === 1 ? '' : 's'}` : ''}</span>
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAccess({ id: s.id, name: `${s.firstName} ${s.lastName}`, role: s.role, loginEmail: s.loginEmail, loginRole: s.loginRole })} title="Access & teaching"><KeyRound className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(s)} disabled={deletingId === s.id} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator page={page} pageSize={pageSize} total={total} onPage={go} className="border-t" />
        </CardContent>
      </Card>

      <StaffAccessDialog target={access} onClose={() => setAccess(null)} classes={classes} subjects={subjects} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Staff Member</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First Name</Label><Input value={editForm.firstName} onChange={(e: any) => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
              <div className="space-y-2"><Label>Last Name</Label><Input value={editForm.lastName} onChange={(e: any) => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Employee No</Label><Input value={editForm.employeeNo} onChange={(e: any) => setEditForm({ ...editForm, employeeNo: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editForm.role} onValueChange={(v: string) => setEditForm({ ...editForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Teacher">Teacher</SelectItem>
                    <SelectItem value="Accountant">Accountant</SelectItem>
                    <SelectItem value="Librarian">Librarian</SelectItem>
                    <SelectItem value="Security">Security</SelectItem>
                    <SelectItem value="Cleaner">Cleaner</SelectItem>
                    <SelectItem value="Driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Salary (TZS)</Label><Input type="number" value={editForm.salary} onChange={(e: any) => setEditForm({ ...editForm, salary: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={editForm.phone} onChange={(e: any) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v: string) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                    <SelectItem value="RESIGNED">Resigned</SelectItem>
                    <SelectItem value="TERMINATED">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleEdit} disabled={editLoading} className="w-full">{editLoading ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
