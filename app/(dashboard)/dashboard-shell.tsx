'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  UserCheck,
  School,
  Clock,
  CalendarCheck,
  FileText,
  DollarSign,
  BookOpen,
  Building2,
  Bus,
  Calendar,
  MessageSquare,
  BarChart3,
  Award,
  IdCard,
  Briefcase,
  Landmark,
  LayoutGrid,
  NotebookPen,
  MessagesSquare,
  Settings,
  PanelLeft,
  LogOut,
  Globe,
  Shield,
  Heart,
  X,
  BookMarked,
} from 'lucide-react'
import type { SessionUser } from '@/lib/types'
import { NotificationBell } from '@/components/notification-bell'

const navItems: { key: string; href: string; icon: any; cap?: string; platform?: boolean; onlyFor?: string[]; hideFor?: string[] }[] = [
  { key: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, cap: 'dashboard' },
  { key: 'nav.students', href: '/dashboard/students', icon: Users, cap: 'studentsRead' },
  { key: 'nav.teachers', href: '/dashboard/teachers', icon: UserCheck, cap: 'staff' },
  { key: 'nav.classes', href: '/dashboard/classes', icon: School, cap: 'classesRead' },
  { key: 'nav.academics', href: '/dashboard/academics', icon: BookMarked, cap: 'academicsRead' },
  { key: 'nav.timetable', href: '/dashboard/timetable', icon: Clock, cap: 'timetableRead' },
  { key: 'nav.seating', href: '/dashboard/seating', icon: LayoutGrid, cap: 'classesRead' },
  { key: 'nav.homework', href: '/dashboard/homework', icon: NotebookPen, cap: 'homework' },
  { key: 'nav.messages', href: '/dashboard/messages', icon: MessagesSquare, cap: 'messaging' },
  { key: 'nav.attendance', href: '/dashboard/attendance', icon: CalendarCheck, cap: 'attendance' },
  { key: 'nav.exams', href: '/dashboard/exams', icon: FileText, cap: 'exams' },
  { key: 'nav.results', href: '/dashboard/reports/academic', icon: Award, cap: 'academicsRead' },
  { key: 'nav.idCards', href: '/dashboard/id-cards', icon: IdCard, cap: 'idCards' },
  { key: 'nav.hr', href: '/dashboard/hr', icon: Briefcase, cap: 'hr' },
  { key: 'nav.accounting', href: '/dashboard/accounting', icon: Landmark, cap: 'accounting' },
  { key: 'nav.myHr', href: '/dashboard/hr/me', icon: Briefcase, cap: 'hrSelf', hideFor: ['SCHOOL_ADMIN'] },
  { key: 'nav.fees', href: '/dashboard/fees', icon: DollarSign, cap: 'fees' },
  { key: 'nav.library', href: '/dashboard/library', icon: BookOpen, cap: 'library' },
  { key: 'nav.hostel', href: '/dashboard/hostel', icon: Building2, cap: 'hostel' },
  { key: 'nav.transport', href: '/dashboard/transport', icon: Bus, cap: 'transport' },
  { key: 'nav.events', href: '/dashboard/events', icon: Calendar, cap: 'events' },
  { key: 'nav.communications', href: '/dashboard/communications', icon: MessageSquare, cap: 'announcements' },
  { key: 'nav.reports', href: '/dashboard/reports', icon: BarChart3, cap: 'reports' },
  { key: 'nav.myRecords', href: '/dashboard/my', icon: GraduationCap, cap: 'ownRecord' },
  { key: 'nav.parents', href: '/dashboard/parents', icon: Heart, cap: 'parents', onlyFor: ['PARENT'] },
  { key: 'nav.settings', href: '/dashboard/settings', icon: Settings, cap: 'settingsRead' },
  { key: 'nav.superAdmin', href: '/dashboard/super-admin', icon: Shield, platform: true },
]

export function DashboardShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { t, locale, setLocale } = useI18n()

  // The sidebar shows what this user can actually do in this school (Settings → Roles),
  // and a platform admin sees only the platform console.
  const caps = new Set(user.caps ?? [])
  const filteredNav = navItems.filter((item) => {
    if (item.platform) return user.role === 'SUPER_ADMIN'
    if (user.role === 'SUPER_ADMIN') return false
    if (item.onlyFor && !item.onlyFor.includes(user.role)) return false
    if (item.hideFor?.includes(user.role)) return false
    return !!item.cap && caps.has(item.cap)
  })

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-out lg:translate-x-0',
          'bg-[hsl(210,20%,10%)] text-[hsl(210,10%,85%)]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg tz-gradient flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="font-display font-bold text-white text-lg">Shule SMS</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-none">
            {filteredNav.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-white'
                      : 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{t(item.key)}</span>
                </Link>
              )
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-primary/30 flex items-center justify-center text-white font-semibold text-sm">
                {user.name?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-white/50 truncate">{user.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => signOut({ redirectTo: '/login' })}
            >
              <LogOut className="w-4 h-4" />
              {t('common.logout')}
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card/80 backdrop-blur-md px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocale(locale === 'en' ? 'sw' : 'en')}
            className="gap-1.5"
          >
            <Globe className="w-4 h-4" />
            {locale === 'en' ? 'Swahili' : 'English'}
          </Button>
          <NotificationBell />
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
