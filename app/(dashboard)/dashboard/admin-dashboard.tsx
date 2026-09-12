'use client'

import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FadeIn, SlideIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { cn } from '@/lib/utils'
import {
  Users,
  UserCheck,
  CalendarCheck,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react'

interface DashboardStats {
  studentCount: number
  staffCount: number
  todayAttendance: number
  feesCollected: number
  pendingFees: number
  recentStudents: Array<{ id: string; name: string; class: string; status: string; admissionNo: string }>
  recentPayments: Array<{ id: string; student: string; amount: number; fee: string; method: string; date: string }>
}

function formatTZS(amount: number): string {
  return `TZS ${(amount ?? 0).toLocaleString('en-US')}`
}

export function AdminDashboard({ stats }: { stats: DashboardStats }) {
  const { t } = useI18n()

  const statCards = [
    {
      label: t('dash.totalStudents'),
      value: stats?.studentCount ?? 0,
      icon: Users,
      color: 'bg-primary/10 text-primary',
    },
    {
      label: t('dash.totalTeachers'),
      value: stats?.staffCount ?? 0,
      icon: UserCheck,
      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    {
      label: t('dash.todayAttendance'),
      value: stats?.todayAttendance ?? 0,
      icon: CalendarCheck,
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
    {
      label: t('dash.feesCollected'),
      value: formatTZS(stats?.feesCollected ?? 0),
      icon: DollarSign,
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
      label: t('dash.pendingFees'),
      value: formatTZS(stats?.pendingFees ?? 0),
      icon: AlertTriangle,
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
  ]

  return (
    <div className="space-y-8">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.dashboard')}</h1>
          <p className="text-muted-foreground mt-1">{t('dash.subtitle')}</p>
        </div>
      </FadeIn>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat, i) => {
          const Icon = stat.icon
          return (
            <StaggerItem key={i}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', stat.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold font-mono">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            </StaggerItem>
          )
        })}
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-2">
        <SlideIn from="left">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">{t('dash.recentEnrollments')}</CardTitle>
            </CardHeader>
            <CardContent>
              {(stats?.recentStudents?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dash.noRecentEnrollments')}</p>
              ) : (
                <div className="space-y-3">
                  {(stats?.recentStudents ?? []).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.admissionNo} • {s.class}</p>
                      </div>
                      <Badge variant={s.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                        {s.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </SlideIn>

        <SlideIn from="right">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">{t('dash.recentPayments')}</CardTitle>
            </CardHeader>
            <CardContent>
              {(stats?.recentPayments?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dash.noRecentPayments')}</p>
              ) : (
                <div className="space-y-3">
                  {(stats?.recentPayments ?? []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{p.student}</p>
                        <p className="text-xs text-muted-foreground">{p.fee} • {p.method}</p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-emerald-600">
                        {formatTZS(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </SlideIn>
      </div>
    </div>
  )
}
