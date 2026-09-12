'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FadeIn } from '@/components/ui/animate'
import { BookOpen, Plus, Search, BookUp, BookDown, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Paginator, pageHref } from '@/components/ui/paginator'

interface BookItem { id: string; title: string; author: string; isbn: string; category: string; totalCopies: number; available: number; issueCount: number }
interface Student { id: string; name: string; admissionNo: string }
interface Issue { id: string; bookTitle: string; student: string; issueDate: string; dueDate: string; overdue: boolean }

export function LibraryClient({ books, availableBooks, students, issues, categories: initialCategories = [], query = '', pageSize, booksPage, booksTotal, issuesPage, issuesTotal, overdueTotal }: {
  books: BookItem[]; availableBooks: { id: string; title: string; available: number }[]; students: Student[]; issues: Issue[]; categories?: { id: string; name: string }[];
  query?: string; pageSize: number; booksPage: number; booksTotal: number; issuesPage: number; issuesTotal: number; overdueTotal: number;
}) {
  const [categories, setCategories] = useState(initialCategories)
  const [newCategory, setNewCategory] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const addCategory = async () => {
    const name = newCategory.trim(); if (name.length < 2) return
    setAddingCategory(true)
    try {
      const r = await fetch('/api/library/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Could not add the category'); return }
      if (!d.existed) setCategories((cs) => [...cs, d.category].sort((a, b) => a.name.localeCompare(b.name)))
      setForm((f) => ({ ...f, categoryId: d.category.id })); setNewCategory('')
      toast.success(d.existed ? 'That category already exists — selected it' : `Category "${d.category.name}" added`)
    } finally { setAddingCategory(false) }
  }
  const { t } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  // Search and both tables page on the server; each table keeps its own page key so one does not reset the other.
  const [search, setSearch] = useState(query)
  const goBooks = (p: number, q: string = search) => {
    const sp = new URLSearchParams(params.toString())
    if (q.trim()) sp.set('q', q.trim()); else sp.delete('q')
    router.push(pageHref('/dashboard/library', sp, 'bp', p))
  }
  const goIssues = (p: number) => router.push(pageHref('/dashboard/library', params.toString(), 'ip', p))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [form, setForm] = useState({ title: '', author: '', isbn: '', categoryId: '', totalCopies: '1' })
  const [issueForm, setIssueForm] = useState({ bookId: '', studentId: '', dueDate: '' })
  const [loading, setLoading] = useState(false)
  const [returningId, setReturningId] = useState<string | null>(null)


  const handleAdd = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, totalCopies: parseInt(form.totalCopies) || 1 }),
      })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Book added')
      setDialogOpen(false)
      setForm({ title: '', author: '', isbn: '', categoryId: '', totalCopies: '1' })
      router.refresh()
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const handleIssue = async () => {
    if (!issueForm.bookId || !issueForm.studentId) { toast.error('Select book and student'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/library/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issueForm),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success('Book issued')
      setIssueOpen(false)
      setIssueForm({ bookId: '', studentId: '', dueDate: '' })
      router.refresh()
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const handleReturn = async (issueId: string) => {
    setReturningId(issueId)
    try {
      const res = await fetch('/api/library/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error ?? 'Failed'); return }
      toast.success(d.fine > 0 ? `Returned — Fine: TZS ${d.fine.toLocaleString('en-US')} (${d.overdueDays} days overdue)` : 'Book returned')
      router.refresh()
    } catch { toast.error('Error') } finally { setReturningId(null) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.library')}</h1>
            <p className="text-muted-foreground mt-1">Manage book catalog, issues, and returns.</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
              <DialogTrigger asChild><Button variant="outline" className="gap-2" disabled={availableBooks.length === 0}><BookUp className="w-4 h-4" /> Issue Book</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Issue Book to Student</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label>Book</Label>
                    <Select value={issueForm.bookId} onValueChange={(v: string) => setIssueForm({ ...issueForm, bookId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
                      <SelectContent>
                        {availableBooks.map((b) => <SelectItem key={b.id} value={b.id}>{b.title} ({b.available} available)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Student</Label>
                    <Select value={issueForm.studentId} onValueChange={(v: string) => setIssueForm({ ...issueForm, studentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>
                        {(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date (defaults to 14 days)</Label>
                    <Input type="date" value={issueForm.dueDate} onChange={(e: any) => setIssueForm({ ...issueForm, dueDate: e.target.value })} />
                  </div>
                  <Button onClick={handleIssue} disabled={loading} className="w-full">{loading ? 'Issuing...' : 'Issue Book'}</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add Book</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add New Book</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Author</Label><Input value={form.author} onChange={(e: any) => setForm({ ...form, author: e.target.value })} /></div>
                    <div className="space-y-2"><Label>ISBN</Label><Input value={form.isbn} onChange={(e: any) => setForm({ ...form, isbn: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Category</Label>
                      <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                        <SelectTrigger><SelectValue placeholder="Choose a shelf" /></SelectTrigger>
                        <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="flex gap-1.5"><Input placeholder="New category…" value={newCategory} onChange={(e: any) => setNewCategory(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }} className="h-8 text-xs" /><Button type="button" size="sm" variant="outline" className="h-8" disabled={addingCategory || newCategory.trim().length < 2} onClick={addCategory}>Add</Button></div>
                    </div>
                    <div className="space-y-2"><Label>Copies</Label><Input type="number" value={form.totalCopies} onChange={(e: any) => setForm({ ...form, totalCopies: e.target.value })} /></div>
                  </div>
                  <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? 'Adding...' : 'Add Book'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Titles</p><p className="text-xl font-bold font-mono">{booksTotal}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><BookUp className="w-5 h-5 text-green-700 dark:text-green-400" /></div>
          <div><p className="text-xs text-muted-foreground">Books Out</p><p className="text-xl font-bold font-mono">{issuesTotal}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-400" /></div>
          <div><p className="text-xs text-muted-foreground">Overdue</p><p className="text-xl font-bold font-mono">{overdueTotal}</p></div>
        </CardContent></Card>
      </div>

      {/* Active Issues */}
      {issuesTotal > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg font-display">Books Currently Out</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Book</th>
                  <th className="text-left p-3 font-medium">Student</th>
                  <th className="text-left p-3 font-medium">Due Date</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Action</th>
                </tr></thead>
                <tbody>
                  {(issues ?? []).map((i: Issue) => (
                    <tr key={i.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{i.bookTitle}</td>
                      <td className="p-3">{i.student}</td>
                      <td className="p-3">{i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}</td>
                      <td className="p-3">{i.overdue ? <Badge variant="destructive" className="text-xs">Overdue</Badge> : <Badge variant="secondary" className="text-xs">On time</Badge>}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" className="gap-1" disabled={returningId === i.id} onClick={() => handleReturn(i.id)}>
                          <BookDown className="w-3 h-3" />{returningId === i.id ? 'Returning...' : 'Return'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator page={issuesPage} pageSize={pageSize} total={issuesTotal} onPage={goIssues} className="border-t" />
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search books..." value={search} onChange={(e: any) => setSearch(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') goBooks(1) }} onBlur={() => { if (search.trim() !== query) goBooks(1) }} className="pl-10" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg font-display">Book Catalog</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Author</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Available</th>
                <th className="text-left p-3 font-medium">Issues</th>
              </tr></thead>
              <tbody>
                {(books ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No books found</td></tr>
                ) : (books ?? []).map((b: BookItem) => (
                  <tr key={b.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{b.title}</td>
                    <td className="p-3">{b.author}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{b.category || 'General'}</Badge></td>
                    <td className="p-3 font-mono">{b.available}/{b.totalCopies}</td>
                    <td className="p-3 font-mono">{b.issueCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator page={booksPage} pageSize={pageSize} total={booksTotal} onPage={goBooks} className="border-t" />
        </CardContent>
      </Card>
    </div>
  )
}
