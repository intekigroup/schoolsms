'use client'

import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { BarChart3, Users, UserCheck, School, DollarSign, CalendarCheck, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Award } from 'lucide-react'

interface Stats {
  studentCount: number; staffCount: number; classCount: number;
  feesTotal: number; attendancePresent: number;
}

export function ReportsClient({ stats }: { stats: Stats }) {
  const { t } = useI18n()

  const reportCards = [
    { label: 'Active Students', value: stats?.studentCount ?? 0, icon: Users, color: 'text-primary bg-primary/10' },
    { label: 'Active Staff', value: stats?.staffCount ?? 0, icon: UserCheck, color: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' },
    { label: 'Classes', value: stats?.classCount ?? 0, icon: School, color: 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30' },
    { label: 'Fees Collected', value: `TZS ${(stats?.feesTotal ?? 0).toLocaleString('en-US')}`, icon: DollarSign, color: 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30' },
    { label: 'Attendance Records', value: stats?.attendancePresent ?? 0, icon: CalendarCheck, color: 'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30' },
  ]

  const reports = [
    { name: 'Student Performance Report', desc: 'Grades and rankings by class', type: 'grades' },
    { name: 'Financial Summary', desc: 'Fee collections and outstanding balances', type: 'fees' },
    { name: 'Attendance Report', desc: 'Daily, weekly, and monthly attendance', type: 'attendance' },
    { name: 'Staff Payroll Report', desc: 'Salary breakdown and deductions', type: 'staff' },
    { name: 'Library Report', desc: 'Book issues, returns, and overdue', type: 'library' },
    { name: 'Student Roster', desc: 'Full list of enrolled students', type: 'students' },
  ]

  const handleDownload = (type: string) => {
    const a = document.createElement('a')
    a.href = `/api/reports/export?type=${type}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.reports')}</h1>
          <p className="text-muted-foreground mt-1">School-wide analytics and exportable reports.</p>
        </div>
      </FadeIn>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {reportCards.map((c, i) => {
          const Icon = c.icon
          return (
            <StaggerItem key={i}>
              <Card>
                <CardContent className="p-5">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', c.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold font-mono">{c.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
                </CardContent>
              </Card>
            </StaggerItem>
          )
        })}
      </Stagger>

      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-display font-semibold">Academic reports</p>
            <p className="text-sm text-muted-foreground">Report cards, class results sheets, subject analysis and performance summaries — configured under Settings → Reports.</p>
          </div>
          <Button asChild className="gap-1.5"><Link href="/dashboard/reports/academic"><Award className="w-4 h-4" /> Open class results</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg font-display">Available Reports</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((r, i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDownload(r.type)} title="Download CSV"><Download className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
