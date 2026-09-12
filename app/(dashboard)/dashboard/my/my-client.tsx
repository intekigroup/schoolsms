'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { FadeIn } from '@/components/ui/animate'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GraduationCap, CalendarCheck, Wallet, BookOpen, Clock, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { formatMoney, formatDate } from '@/lib/format'

interface Result { id: string; subject: string; exam: string; marks: number; outOf: number; grade: string }
interface Payment { id: string; name: string; amount: number; receiptNo: string; paidAt: string }
interface Loan { id: string; title: string; author: string; dueDate: string; overdue: boolean }
interface Slot { id: string; day: number; start: string; end: string; subject: string; teacher: string; room: string }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function MyClient({
  name, admissionNo, className, attendanceRate, attendanceCounts, fees, results, payments, loans, timetable, homework = [],
}: {
  homework?: { id: string; kind: string; title: string; description: string; subjectName: string | null; teacher: string | null; dueDate: string | null }[]
  name: string
  admissionNo: string
  className: string
  attendanceRate: number | null
  attendanceCounts: { present: number; late: number; absent: number; total: number }
  fees: { billed: number; paid: number; balance: number }
  results: Result[]
  payments: Payment[]
  loans: Loan[]
  timetable: Slot[]
}) {
  const { t, locale } = useI18n()
  const money = (n: number) => formatMoney(n, locale)
  const date = (d: string) => formatDate(d, locale)

  const gradeTone = (g: string) =>
    g === 'A' ? 'default' : g === 'B' ? 'secondary' : g === 'F' ? 'destructive' : 'outline'

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{name}</h1>
            <p className="text-muted-foreground mt-1">
              {admissionNo} · {className}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href="/api/reports/report-card"><FileDown className="w-4 h-4" /> Report card</a>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href="/api/reports/fee-statement"><FileDown className="w-4 h-4" /> {t('my.feeStatement')}</a>
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* Three things a student actually wants to know */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarCheck className="w-4 h-4" />
              <span className="text-sm">{t('my.attendance')}</span>
            </div>
            {attendanceRate === null ? (
              <p className="text-sm text-muted-foreground">{t('my.noAttendance')}</p>
            ) : (
              <>
                <p className="font-display text-3xl font-bold tabular-nums">{attendanceRate}%</p>
                <Progress value={attendanceRate} />
                <p className="text-xs text-muted-foreground">
                  {attendanceCounts.present} present · {attendanceCounts.late} late · {attendanceCounts.absent} absent
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="w-4 h-4" />
              <span className="text-sm">{t('my.feeBalance')}</span>
            </div>
            <p className={`font-display text-3xl font-bold tabular-nums ${fees.balance > 0 ? 'text-destructive' : ''}`}>
              {money(fees.balance)}
            </p>
            <p className="text-xs text-muted-foreground">
              {money(fees.paid)} paid of {money(fees.billed)} billed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="w-4 h-4" />
              <span className="text-sm">{t('my.library')}</span>
            </div>
            <p className="font-display text-3xl font-bold tabular-nums">{loans.length}</p>
            <p className="text-xs text-muted-foreground">
              {loans.length === 0
                ? 'No books on loan'
                : `${loans.filter((l) => l.overdue).length} overdue`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results" className="gap-2"><GraduationCap className="w-4 h-4" /> Results</TabsTrigger>
          <TabsTrigger value="timetable" className="gap-2"><Clock className="w-4 h-4" /> Timetable</TabsTrigger>
          <TabsTrigger value="fees" className="gap-2"><Wallet className="w-4 h-4" /> Payments</TabsTrigger>
          <TabsTrigger value="library" className="gap-2"><BookOpen className="w-4 h-4" /> Books</TabsTrigger>
          <TabsTrigger value="homework" className="gap-2"><BookOpen className="w-4 h-4" /> Homework</TabsTrigger>
        </TabsList>

        <TabsContent value="homework" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('my.homeworkNotes')}</CardTitle></CardHeader>
            <CardContent>
              {homework.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">{t('my.nothingPosted')}</p> : (
                <div className="space-y-3">{homework.map((h) => (
                  <div key={h.id} className="p-3 rounded-lg bg-muted/50">
                    <p className="font-medium text-sm">{h.kind === 'HOMEWORK' ? 'Homework' : 'Note'} · {h.title}<span className="ml-2 text-xs font-normal text-muted-foreground">{h.subjectName ?? ''}{h.teacher ? ` · ${h.teacher}` : ''}</span></p>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{h.description}</p>
                    {h.dueDate && <p className="text-xs mt-1 font-medium">Due {date(h.dueDate)}</p>}
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('my.myResults')}</CardTitle></CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('my.noResults')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">{t('common.subject')}</th>
                        <th className="py-2 pr-4 font-medium">{t('common.exam')}</th>
                        <th className="py-2 pr-4 font-medium text-right">{t('common.marks')}</th>
                        <th className="py-2 font-medium">{t('common.grade')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{r.subject}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{r.exam}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{r.marks}/{r.outOf}</td>
                          <td className="py-2"><Badge variant={gradeTone(r.grade) as any}>{r.grade}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timetable" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('my.myClassTimetable')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {timetable.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('my.noTimetable')}</p>
              ) : (
                [1, 2, 3, 4, 5].map((day) => {
                  const slots = timetable.filter((s) => s.day === day)
                  if (!slots.length) return null
                  return (
                    <div key={day}>
                      <p className="font-medium text-sm mb-2">{DAYS[day]}</p>
                      <div className="space-y-1">
                        {slots.map((s) => (
                          <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
                            <span className="tabular-nums text-muted-foreground">{s.start}–{s.end}</span>
                            <span className="font-medium">{s.subject}</span>
                            {s.teacher && <span className="text-muted-foreground text-xs">{s.teacher}</span>}
                            {s.room && <span className="text-muted-foreground text-xs">Room {s.room}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('my.myPayments')}</CardTitle></CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('my.noPayments')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">Fee</th>
                        <th className="py-2 pr-4 font-medium">{t('my.receipt')}</th>
                        <th className="py-2 pr-4 font-medium">{t('common.date')}</th>
                        <th className="py-2 font-medium text-right">{t('common.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{p.name}</td>
                          <td className="py-2 pr-4 text-muted-foreground font-mono text-xs"><a href={`/api/fees/receipt?paymentId=${p.id}`} target="_blank" rel="noopener" className="text-primary hover:underline">{p.receiptNo || t('parent.receipt')}</a></td>
                          <td className="py-2 pr-4 text-muted-foreground">{date(p.paidAt)}</td>
                          <td className="py-2 text-right tabular-nums">{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('my.booksOut')}</CardTitle></CardHeader>
            <CardContent>
              {loans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t('my.nothingOnLoan')}</p>
              ) : (
                <div className="space-y-2">
                  {loans.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{l.title}</p>
                        {l.author && <p className="text-xs text-muted-foreground">{l.author}</p>}
                      </div>
                      <Badge variant={l.overdue ? 'destructive' : 'secondary'}>
                        {l.overdue ? 'Overdue' : 'Due'} {date(l.dueDate)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
