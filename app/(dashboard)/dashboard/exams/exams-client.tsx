'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FadeIn } from '@/components/ui/animate'
import { FileText, Plus, Search, ClipboardEdit } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Paginator, pageHref } from '@/components/ui/paginator'

interface ExamItem {
  id: string; name: string; type: string; className: string;
  subjectName: string; totalMarks: number; resultCount: number; date: string;
  expected: number; termId: string; status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED'; reviewNote: string | null;
}
interface BoardRow { id: string; name: string; className: string; subjectName: string; entered: number; expected: number; status: string; reviewNote: string | null }

const examTypes = ['CAT', 'MIDTERM', 'END_OF_TERM', 'MOCK', 'NECTA_MOCK', 'NECTA']

interface MarkStudent { id: string; name: string; admissionNo: string; marks: string; grade: string }

export function ExamsClient({ exams, classes, subjects, academicYears, isAdmin = false, page, pageSize, total, query = '' }: {
  isAdmin?: boolean;
  exams: ExamItem[]; page: number; pageSize: number; total: number; query?: string;
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  academicYears: { id: string; name: string; terms: { id: string; name: string }[] }[];
}) {
  const { t } = useI18n()
  const router = useRouter()
  // Search and paging run on the server so they cover every exam, not just this page.
  const [search, setSearch] = useState(query)
  const go = (p: number, q: string = search) => {
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    router.push(pageHref('/dashboard/exams', sp, 'page', p))
  }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'CAT', classId: '', subjectId: '', academicYearId: '', totalMarks: '100' })
  const [loading, setLoading] = useState(false)

  // Enter Marks state
  const [marksOpen, setMarksOpen] = useState(false)
  const [marksExam, setMarksExam] = useState<ExamItem | null>(null)
  const [markStudents, setMarkStudents] = useState<MarkStudent[]>([])
  const [marksLoading, setMarksLoading] = useState(false)
  const [marksSaving, setMarksSaving] = useState(false)
  const [marksTotalMarks, setMarksTotalMarks] = useState(100)
  const [marksLocked, setMarksLocked] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [boardTerm, setBoardTerm] = useState(academicYears[0]?.terms?.[0]?.id ?? '')
  const [board, setBoard] = useState<{ exams: BoardRow[]; summary: { total: number; draft: number; submitted: number; published: number; incomplete: number } } | null>(null)
  const loadBoard = async (termId: string) => { if (!termId) return; const r = await fetch(`/api/exams/workflow?termId=${termId}`); if (r.ok) setBoard(await r.json()) }
  useEffect(() => { loadBoard(boardTerm) }, [boardTerm]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Workflow actions: submit (teacher) · publish / reject / reopen (office). Confirms the 409 prompts. */
  const workflow = async (exam: { id: string; name: string }, action: string, extra: Record<string, unknown> = {}) => {
    setBusyId(exam.id)
    try {
      const res = await fetch('/api/exams/workflow', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examId: exam.id, action, ...extra }) })
      const d = await res.json().catch(() => ({}))
      if (res.status === 409 && (d.missing || d.unsubmitted)) { if (window.confirm(`${d.error}`)) return workflow(exam, action, { ...extra, force: true }); return }
      if (!res.ok) { toast.error(d?.error ?? 'Could not update'); return }
      toast.success(action === 'submit' ? 'Submitted for review' : action === 'publish' ? 'Results published' : action === 'reject' ? 'Returned to the teacher' : 'Mark sheet reopened')
      router.refresh(); loadBoard(boardTerm)
    } finally { setBusyId(null) }
  }
  const statusBadge = (st: string) => <Badge variant={st === 'PUBLISHED' ? 'default' : st === 'SUBMITTED' ? 'secondary' : 'outline'} className="text-xs">{st === 'PUBLISHED' ? 'Published' : st === 'SUBMITTED' ? 'Awaiting review' : 'Draft'}</Badge>

  const handleAdd = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, totalMarks: parseFloat(form.totalMarks) || 100 }),
      })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Exam created')
      setDialogOpen(false)
      router.refresh()
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const openMarks = async (exam: ExamItem) => {
    setMarksExam(exam)
    setMarksOpen(true)
    setMarksLoading(true)
    try {
      const res = await fetch(`/api/exams/results?examId=${exam.id}`)
      if (!res.ok) { toast.error('Failed to load students'); setMarksOpen(false); return }
      const data = await res.json()
      setMarkStudents(data.students ?? [])
      setMarksTotalMarks(data.totalMarks ?? 100)
      setMarksLocked(data.status === 'PUBLISHED' || (data.status === 'SUBMITTED' && !isAdmin))
    } catch { toast.error('Error'); setMarksOpen(false) } finally { setMarksLoading(false) }
  }

  const updateMark = (idx: number, marks: string) => {
    setMarkStudents(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], marks }
      return copy
    })
  }

  const saveMarks = async () => {
    if (!marksExam) return
    setMarksSaving(true)
    try {
      const res = await fetch('/api/exams/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: marksExam.id, results: markStudents.map(s => ({ studentId: s.id, marks: s.marks })) }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? 'Failed to save marks'); return }
      toast.success('Marks saved successfully!')
      setMarksOpen(false)
      router.refresh()
    } catch { toast.error('Error') } finally { setMarksSaving(false) }
  }

  const typeColor = (t: string) => {
    if (t.includes('NECTA')) return 'bg-purple-100 text-purple-700'
    if (t === 'END_OF_TERM') return 'bg-blue-100 text-blue-700'
    if (t === 'MIDTERM') return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.exams')}</h1>
            <p className="text-muted-foreground mt-1">Create exams, enter marks, and generate report cards.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Create Exam</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Exam</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>Exam Name</Label><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mid-Term Exam 2026" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{examTypes.map((t: string) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Total Marks</Label><Input type="number" value={form.totalMarks} onChange={(e: any) => setForm({ ...form, totalMarks: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={form.classId} onValueChange={(v: string) => setForm({ ...form, classId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{(classes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select value={form.subjectId} onValueChange={(v: string) => setForm({ ...form, subjectId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{(subjects ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {(academicYears?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <Label>Academic Year</Label>
                    <Select value={form.academicYearId} onValueChange={(v: string) => setForm({ ...form, academicYearId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{(academicYears ?? []).map((ay: any) => <SelectItem key={ay.id} value={ay.id}>{ay.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? 'Creating...' : 'Create Exam'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </FadeIn>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search exams..." value={search} onChange={(e: any) => setSearch(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') go(1) }} onBlur={() => { if (search.trim() !== query) go(1) }} className="pl-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Exam Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Class</th>
                <th className="text-left p-3 font-medium">Subject</th>
                <th className="text-left p-3 font-medium">Total Marks</th>
                <th className="text-left p-3 font-medium">Marks</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {(exams ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No exams found</td></tr>
                ) : (exams ?? []).map((e: ExamItem) => (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{e.name}</td>
                    <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${typeColor(e.type)}`}>{e.type?.replace('_', ' ')}</span></td>
                    <td className="p-3">{e.className}</td>
                    <td className="p-3">{e.subjectName}</td>
                    <td className="p-3 font-mono">{e.totalMarks}</td>
                    <td className="p-3"><span className={`font-mono text-xs ${e.resultCount < e.expected ? 'text-amber-600' : ''}`}>{e.resultCount}/{e.expected}</span></td>
                    <td className="p-3">{statusBadge(e.status)}{e.reviewNote && e.status === 'DRAFT' && <span className="block text-[11px] text-amber-700">Returned: {e.reviewNote}</span>}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => openMarks(e)}>
                          <ClipboardEdit className="w-3.5 h-3.5" /> {e.status === 'PUBLISHED' || (e.status === 'SUBMITTED' && !isAdmin) ? 'View marks' : 'Enter marks'}
                        </Button>
                        {e.status === 'DRAFT' && <Button size="sm" className="h-7" disabled={busyId === e.id || e.resultCount === 0} onClick={() => workflow(e, 'submit')}>Submit</Button>}
                        {isAdmin && e.status === 'SUBMITTED' && <><Button size="sm" className="h-7" disabled={busyId === e.id} onClick={() => workflow(e, 'publish')}>Publish</Button><Button size="sm" variant="outline" className="h-7" disabled={busyId === e.id} onClick={() => { const note = window.prompt('Note for the teacher'); if (note !== null) workflow(e, 'reject', { note }) }}>Return</Button></>}
                        {isAdmin && e.status === 'DRAFT' && e.resultCount > 0 && <Button size="sm" variant="outline" className="h-7" disabled={busyId === e.id} onClick={() => workflow(e, 'publish')}>Publish</Button>}
                        {isAdmin && e.status === 'PUBLISHED' && <Button size="sm" variant="ghost" className="h-7" disabled={busyId === e.id} onClick={() => { if (window.confirm('Reopen this mark sheet? It leaves report cards until published again.')) workflow(e, 'reopen') }}>Reopen</Button>}
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

      {/* Marks board for a term */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-display font-semibold">Marks board</p>
            <Select value={boardTerm} onValueChange={setBoardTerm}><SelectTrigger className="w-56 h-8"><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{academicYears.flatMap((y) => y.terms.map((t) => <SelectItem key={t.id} value={t.id}>{y.name} · {t.name}</SelectItem>))}</SelectContent></Select>
            {board && <p className="text-xs text-muted-foreground">{board.summary.total} mark sheets · {board.summary.incomplete} incomplete · {board.summary.submitted} awaiting review · {board.summary.published} published</p>}
            <span className="flex-1" />
            {isAdmin && board && board.summary.submitted > 0 && <Button size="sm" onClick={async () => { if (!window.confirm(`Publish all ${board.summary.submitted} submitted mark sheets for this term?`)) return; const r = await fetch('/api/exams/workflow', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termId: boardTerm, action: 'publish-term' }) }); const d = await r.json().catch(() => ({})); if (!r.ok) { toast.error(d?.error ?? 'Failed'); return } toast.success(`Published ${d.published} mark sheets`); router.refresh(); loadBoard(boardTerm) }}>Publish all submitted</Button>}
          </div>
          {board && board.exams.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-muted/50 text-left"><th className="p-2">Class</th><th className="p-2">Subject</th><th className="p-2">Exam</th><th className="p-2 text-right">Entered</th><th className="p-2">Progress</th><th className="p-2">Status</th></tr></thead>
              <tbody>{board.exams.map((b) => <tr key={b.id} className="border-b"><td className="p-2">{b.className}</td><td className="p-2">{b.subjectName}</td><td className="p-2">{b.name}</td><td className="p-2 text-right font-mono">{b.entered}/{b.expected}</td><td className="p-2 w-40"><div className="h-2 rounded bg-muted"><div className={`h-2 rounded ${b.entered >= b.expected ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${b.expected ? Math.min(100, Math.round((b.entered / b.expected) * 100)) : 0}%` }} /></div></td><td className="p-2">{statusBadge(b.status)}</td></tr>)}</tbody></table></div>
          )}
          {board && board.exams.length === 0 && <p className="text-xs text-muted-foreground">No exams in this term yet.</p>}
        </CardContent>
      </Card>

      {/* Enter Marks Dialog */}
      <Dialog open={marksOpen} onOpenChange={setMarksOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Marks — {marksExam?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">{marksExam?.className} · {marksExam?.subjectName} · Total: {marksTotalMarks}{marksLocked ? ' · locked' : ''}</p>
            {marksLocked && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{marksExam?.status === 'PUBLISHED' ? 'These marks are published. The office can reopen the sheet if a correction is needed.' : 'Submitted for review — the office will publish or return it.'}</p>}
          </DialogHeader>
          {marksLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading students…</div>
          ) : markStudents.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No active students in this class</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">#</th>
                  <th className="text-left p-2 font-medium">Student</th>
                  <th className="text-left p-2 font-medium">Adm No</th>
                  <th className="text-left p-2 font-medium w-28">Marks</th>
                  <th className="text-left p-2 font-medium">Grade</th>
                </tr></thead>
                <tbody>
                  {markStudents.map((s, i) => {
                    const m = parseFloat(s.marks as string)
                    const pct = !isNaN(m) ? (m / marksTotalMarks) * 100 : -1
                    const grade = pct >= 75 ? 'A' : pct >= 65 ? 'B' : pct >= 45 ? 'C' : pct >= 30 ? 'D' : pct >= 0 ? 'F' : '—'
                    const gc = grade === 'A' ? 'text-green-700' : grade === 'B' ? 'text-blue-700' : grade === 'C' ? 'text-amber-700' : grade === 'D' ? 'text-orange-700' : grade === 'F' ? 'text-red-700' : ''
                    return (
                      <tr key={s.id} className="border-b hover:bg-muted/30">
                        <td className="p-2">{i + 1}</td>
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2 font-mono text-xs">{s.admissionNo}</td>
                        <td className="p-2"><Input type="number" min={0} max={marksTotalMarks} className="h-8 w-24" value={s.marks} disabled={marksLocked} onChange={(e: any) => updateMark(i, e.target.value)} placeholder="—" /></td>
                        <td className={`p-2 font-bold ${gc}`}>{grade}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex justify-end pt-4">
                {!marksLocked && <Button onClick={saveMarks} disabled={marksSaving} className="gap-2">
                  <ClipboardEdit className="w-4 h-4" />{marksSaving ? 'Saving…' : 'Save Marks'}
                </Button>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
