'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FadeIn } from '@/components/ui/animate'
import { Settings, School, GraduationCap, Calendar, Shield, Lock, IdCard, Briefcase, Landmark } from "lucide-react"
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { toast } from "sonner"
import { ReportSettings } from "./report-settings"
import { IdCardSettings } from "./id-card-settings"
import { HrSettings } from "./hr-settings"
import { AccountingSettings } from "./accounting-settings"
import { SchoolProfile } from "./school-profile"
import { RolesSettings } from "./roles-settings"

export function SettingsClient({ initialTab = "school", canEdit = true }: { initialTab?: string; canEdit?: boolean }) {
  const { t } = useI18n()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)

  const handleChangePassword = async () => {
    setPwSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not change password'); return }
      toast.success('Password changed')
      setPw({ current: '', next: '', confirm: '' })
    } catch { toast.error('Something went wrong') } finally { setPwSaving(false) }
  }


  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.settings')}</h1>
          <p className="text-muted-foreground mt-1">{t('settings.subtitle')}</p>
        </div>
      </FadeIn>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="school" className="gap-1.5"><School className="w-4 h-4" />{t('settings.tabSchool')}</TabsTrigger>
          <TabsTrigger value="academic" className="gap-1.5"><Calendar className="w-4 h-4" />{t('settings.tabAcademic')}</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><GraduationCap className="w-4 h-4" />{t('settings.tabReports')}</TabsTrigger>
          <TabsTrigger value="idcards" className="gap-1.5"><IdCard className="w-4 h-4" />{t('settings.tabIdCards')}</TabsTrigger>
          <TabsTrigger value="hr" className="gap-1.5"><Briefcase className="w-4 h-4" />{t('settings.tabHr')}</TabsTrigger>
          <TabsTrigger value="accounting" className="gap-1.5"><Landmark className="w-4 h-4" />{t('settings.tabAccounting')}</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Shield className="w-4 h-4" />{t('settings.tabRoles')}</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Lock className="w-4 h-4" />{t('settings.tabSecurity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="school"><SchoolProfile canEdit={canEdit} /></TabsContent>

        <TabsContent value="academic">
          <Card>
            <CardHeader><CardTitle>Academic Year & Terms</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Configure academic years and term dates for your school.</p>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="font-medium">Tanzania Academic Calendar</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p>Term 1: January - March</p>
                  <p>Term 2: May - August</p>
                  <p>Term 3: September - November</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <ReportSettings canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="idcards">
          <IdCardSettings canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="hr">
          <HrSettings canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="accounting">
          <AccountingSettings canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="roles"><RolesSettings canEdit={canEdit} /></TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 max-w-md">
                <div className="space-y-2">
                  <Label>Current password</Label>
                  <Input type="password" value={pw.current} placeholder="••••••••"
                    onChange={(e: any) => setPw({ ...pw, current: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>New password</Label>
                  <Input type="password" value={pw.next} placeholder="At least 8 characters"
                    onChange={(e: any) => setPw({ ...pw, next: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Confirm new password</Label>
                  <Input type="password" value={pw.confirm} placeholder="••••••••"
                    onChange={(e: any) => setPw({ ...pw, confirm: e.target.value })} />
                  {pw.confirm.length > 0 && pw.next !== pw.confirm && (
                    <p className="text-destructive text-xs">Passwords do not match</p>
                  )}
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={pwSaving || pw.next.length < 8 || pw.next !== pw.confirm || !pw.current}
                  className="w-fit"
                >
                  {pwSaving ? 'Saving…' : 'Change password'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sessions use JWTs, so any other device you are signed in on stays signed in until its
                  token expires.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
