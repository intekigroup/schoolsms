'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FadeIn } from '@/components/ui/animate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileDown, Settings2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { ClassResults } from '@/lib/reports/academic'

interface Props {
  classes: { id: string; name: string; level: string }[]
  years: { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string }[] }[]
  canEditRemarks: boolean
  /** Classes whose remarks this user may write (all, for admins). */
  classTeacherOf: string[]
  isAdmin: boolean
}

const DOCS = [
  { type: 'report-cards', flag: 'reportCard', label: 'Report cards (all pupils)' },
  { type: 'class-sheet', flag: 'classSheet', label: 'Class results sheet' },
  { type: 'subject-analysis', flag: 'subjectAnalysis', label: 'Subject analysis' },
  { type: 'performance-summary', flag: 'performanceSummary', label: 'Performance summary' },
] as const

type RemarkRow = { classTeacherRemark: string; headTeacherRemark: string; conduct: string }

export function AcademicReportsClient({ classes, years, canEditRemarks, classTeacherOf, isAdmin }: Props) {
  const defaultYear = years.find((y) => y.isCurrent) ?? years[0]
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [yearId, setYearId] = useState(defaultYear?.id ?? '')
  const terms = useMemo(() => years.find((y) => y.id === yearId)?.terms ?? [], [years, yearId])
  const [termId, setTermId] = useState(terms[0]?.id ?? '')
  const [results, setResults] = useState<ClassResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [remarks, setRemarks] = useState<Record<string, RemarkRow>>({})
  const [savingRemarks, setSavingRemarks] = useState(false)

  useEffect(() => { if (!terms.some((t) => t.id === termId)) setTermId(terms[0]?.id ?? '') }, [terms, termId])

  useEffect(() => {
    if (!classId || !termId) { setResults(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/reports/academic?classId=${classId}&termId=${termId}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Failed'); return r.json() })
      .then((d: ClassResults) => {
        if (cancelled) return
        setResults(d)
        const next: Record<string, RemarkRow> = {}
        for (const p of d.pupils) next[p.studentId] = {
          classTeacherRemark: p.remarks.classTeacher ?? '', headTeacherRemark: p.remarks.headTeacher ?? '', conduct: p.remarks.conduct ?? '',
        }
        setRemarks(next)
      })
      .catch((e) => { if (!cancelled) { setResults(null); toast.error(e.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [classId, termId])

  const download = (type: string) => {
    const a = document.createElement('a')
    a.href = `/api/reports/academic?classId=${classId}&termId=${termId}&type=${type}`
    a.download = ''
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const saveRemarks = async () => {
    if (!results) return
    setSavingRemarks(true)
    try {
      const res = await fetch('/api/reports/remarks', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termId, remarks: results.pupils.map((p) => ({ studentId: p.studentId, ...remarks[p.studentId] })) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not save remarks'); return }
      toast.success(`Remarks saved for ${d.saved} pupils`)
    } catch { toast.error('Something went wrong') } finally { setSavingRemarks(false) }
  }

  const setRemark = (id: string, field: keyof RemarkRow, value: string) =>
    setRemarks((r) => ({ ...r, [id]: { ...r[id], [field]: value } }))

  const cfg = results?.config
  const mayRemark = canEditRemarks && classTeacherOf.includes(classId)

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Class results</h1>
            <p className="text-muted-foreground mt-1">Rankings, remarks and printable academic reports for a class and term.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/dashboard/settings?tab=reports"><Settings2 className="w-4 h-4" /> Report settings</Link>
          </Button>
        </div>
      </FadeIn>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Academic year</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (current)' : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Term</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
              <SelectContent>{terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Computing results…</p>}

      {results && cfg && (
        <>
          {results.unpublished > 0 && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{results.unpublished} mark sheet{results.unpublished === 1 ? ' is' : 's are'} not yet published and {results.unpublished === 1 ? 'is' : 'are'} included in this preview. Printed documents and the parent portal use published marks only.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pupils" value={String(results.pupils.length)} />
            <Stat label="Subjects assessed" value={String(results.subjects.length)} />
            <Stat label="Class average" value={results.classAverage === null ? '—' : `${results.classAverage.toFixed(1)}%`} />
            <Stat label={results.divisions ? 'Division I–II' : 'A + B grades'}
              value={results.divisions
                ? String((results.divisions['I'] ?? 0) + (results.divisions['II'] ?? 0))
                : String(cfg.scale.slice(0, 2).reduce((n, b) => n + (results.gradeTotals[b.grade] ?? 0), 0))} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Print</CardTitle>
              <CardDescription>PDFs for {results.class.name}, {results.term.name} {results.term.academicYear}. Documents switched off in settings are hidden.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {DOCS.filter((d) => cfg.reports[d.flag]).map((d) => (
                <Button key={d.type} variant="outline" className="gap-1.5" onClick={() => download(d.type)} disabled={results.pupils.length === 0}>
                  <FileDown className="w-4 h-4" /> {d.label}
                </Button>
              ))}
              {DOCS.every((d) => !cfg.reports[d.flag]) && <p className="text-sm text-muted-foreground">All documents are switched off in Settings → Reports.</p>}
            </CardContent>
          </Card>

          <Tabs defaultValue="rankings">
            <TabsList>
              <TabsTrigger value="rankings">Rankings</TabsTrigger>
              <TabsTrigger value="subjects">Subjects</TabsTrigger>
              <TabsTrigger value="remarks">Remarks</TabsTrigger>
            </TabsList>

            <TabsContent value="rankings">
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50 text-left text-xs">
                      {cfg.ranking.enabled && <th className="p-3">Pos</th>}
                      <th className="p-3">Pupil</th><th className="p-3">Adm no</th>
                      {results.subjects.map((s) => <th key={s.subjectId} className="p-3 text-right" title={s.subject}>{s.subject.slice(0, 8)}</th>)}
                      <th className="p-3 text-right">Total</th><th className="p-3 text-right">Avg</th>
                      {results.divisions && <><th className="p-3 text-right">Pts</th><th className="p-3 text-right">Div</th></>}
                    </tr></thead>
                    <tbody>
                      {results.pupils.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={20}>No active pupils in this class.</td></tr>}
                      {[...results.pupils].sort((a, b) => (a.position ?? 999) - (b.position ?? 999)).map((p) => (
                        <tr key={p.studentId} className="border-b">
                          {cfg.ranking.enabled && <td className="p-3 font-bold">{p.position ?? '—'}</td>}
                          <td className="p-3 font-medium whitespace-nowrap">
                            <a className="hover:underline" href={`/api/reports/report-card?studentId=${p.studentId}&termId=${termId}`} title="Download report card">{p.name}</a>
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{p.admissionNo}</td>
                          {p.subjects.map((m) => (
                            <td key={m.subjectId} className="p-3 text-right font-mono tabular-nums">
                              {m.pct === null ? <span className="text-muted-foreground">—</span> : <>{Math.round(m.pct)}<span className="ml-0.5 text-xs text-muted-foreground">{m.grade}</span></>}
                            </td>
                          ))}
                          <td className="p-3 text-right font-mono">{p.taken ? p.total.toFixed(0) : '—'}</td>
                          <td className="p-3 text-right font-mono font-semibold">{p.average === null ? '—' : p.average.toFixed(1)}</td>
                          {results.divisions && <>
                            <td className="p-3 text-right font-mono">{p.points ?? '—'}</td>
                            <td className="p-3 text-right"><Badge variant={p.division === '0' ? 'destructive' : 'secondary'}>{p.division ?? '—'}</Badge></td>
                          </>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subjects">
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50 text-left text-xs">
                      <th className="p-3">Subject</th><th className="p-3 text-right">Sat</th><th className="p-3 text-right">Mean</th>
                      <th className="p-3 text-right">High</th><th className="p-3 text-right">Low</th>
                      {cfg.scale.map((b) => <th key={b.grade} className="p-3 text-right">{b.grade}</th>)}
                    </tr></thead>
                    <tbody>
                      {results.subjects.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={20}>No exams recorded for this class in this term.</td></tr>}
                      {results.subjects.map((s) => (
                        <tr key={s.subjectId} className="border-b">
                          <td className="p-3 font-medium">{s.subject}</td>
                          <td className="p-3 text-right font-mono">{s.taken}</td>
                          <td className="p-3 text-right font-mono font-semibold">{s.mean === null ? '—' : s.mean.toFixed(1)}</td>
                          <td className="p-3 text-right font-mono">{s.highest === null ? '—' : Math.round(s.highest)}</td>
                          <td className="p-3 text-right font-mono">{s.lowest === null ? '—' : Math.round(s.lowest)}</td>
                          {cfg.scale.map((b) => <td key={b.grade} className="p-3 text-right font-mono">{s.distribution[b.grade] ?? 0}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="remarks">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Teacher remarks</CardTitle>
                  <CardDescription>Printed on each report card. Leave the class-teacher remark blank to use the automatic remark for the pupil&apos;s grade{cfg.card.autoRemarks ? '' : ' (currently off in settings)'}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {results.pupils.map((p) => (
                    <div key={p.studentId} className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[200px_1fr_1fr_140px] lg:items-center">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.average === null ? 'No marks' : `${p.average.toFixed(1)}%`}{p.position ? ` · ${p.position}` : ''}</p>
                      </div>
                      <Input placeholder="Class teacher" value={remarks[p.studentId]?.classTeacherRemark ?? ''} disabled={!mayRemark} maxLength={300}
                        onChange={(e) => setRemark(p.studentId, 'classTeacherRemark', e.target.value)} />
                      <Input placeholder="Head teacher" value={remarks[p.studentId]?.headTeacherRemark ?? ''} disabled={!isAdmin} maxLength={300}
                        onChange={(e) => setRemark(p.studentId, 'headTeacherRemark', e.target.value)} />
                      <Input placeholder="Conduct" value={remarks[p.studentId]?.conduct ?? ''} disabled={!mayRemark} maxLength={60}
                        onChange={(e) => setRemark(p.studentId, 'conduct', e.target.value)} />
                    </div>
                  ))}
                  {!mayRemark && canEditRemarks && <p className="text-xs text-muted-foreground">Only the class teacher writes remarks for this class; the head teacher&apos;s line is written by the office.</p>}
                  {mayRemark && results.pupils.length > 0 && (
                    <Button onClick={saveRemarks} disabled={savingRemarks} className="gap-1.5"><Save className="w-4 h-4" /> {savingRemarks ? 'Saving…' : 'Save remarks'}</Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-5">
      <p className="text-2xl font-bold font-mono">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </CardContent></Card>
  )
}
