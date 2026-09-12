'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FadeIn } from '@/components/ui/animate'
import { CalendarCheck, Check, X, Clock, AlertCircle } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface ClassData {
  id: string
  name: string
  students: Array<{ id: string; name: string; admissionNo: string }>
}

type AttStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

export function AttendanceClient({ classes }: { classes: ClassData[] }) {
  const { t } = useI18n()
  const [selectedClass, setSelectedClass] = useState(classes?.[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState('')

  // Set date on client only to avoid SSR mismatch
  useEffect(() => { setSelectedDate(new Date().toISOString().split('T')[0]) }, [])
  const [attendance, setAttendance] = useState<Record<string, AttStatus>>({})
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  const currentClass = classes?.find((c: ClassData) => c.id === selectedClass)
  const students = currentClass?.students ?? []

  // Load existing attendance when class or date changes
  useEffect(() => {
    if (!selectedClass || !selectedDate) return
    setFetching(true)
    fetch(`/api/attendance?classId=${selectedClass}&date=${selectedDate}`)
      .then(r => r.json())
      .then(data => {
        if (data.attendance) setAttendance(data.attendance)
        else setAttendance({})
      })
      .catch(() => setAttendance({}))
      .finally(() => setFetching(false))
  }, [selectedClass, selectedDate])

  const markAll = (status: AttStatus) => {
    const rec: Record<string, AttStatus> = {}
    students.forEach((s: any) => { rec[s.id] = status })
    setAttendance(rec)
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const entries = Object.entries(attendance).map(([studentId, status]) => ({
        studentId,
        status,
        classId: selectedClass,
        date: selectedDate,
      }))
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      if (res.ok) toast.success('Attendance saved!')
      else toast.error('Failed to save')
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const statusIcon = (s: AttStatus) => {
    switch (s) {
      case 'PRESENT': return <Check className="w-4 h-4 text-green-600" />
      case 'ABSENT': return <X className="w-4 h-4 text-red-600" />
      case 'LATE': return <Clock className="w-4 h-4 text-amber-600" />
      case 'EXCUSED': return <AlertCircle className="w-4 h-4 text-blue-600" />
    }
  }

  // Summary counts
  const present = Object.values(attendance).filter(s => s === 'PRESENT').length
  const absent = Object.values(attendance).filter(s => s === 'ABSENT').length
  const late = Object.values(attendance).filter(s => s === 'LATE').length
  const excused = Object.values(attendance).filter(s => s === 'EXCUSED').length
  const marked = present + absent + late + excused

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('nav.attendance')}</h1>
          <p className="text-muted-foreground mt-1">{t('attendance.subtitle2')}</p>
        </div>
      </FadeIn>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger className="w-[250px]"><SelectValue placeholder={t('attendance.selectClassPh')} /></SelectTrigger>
          <SelectContent>
            {(classes ?? []).map((c: ClassData) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={selectedDate} onChange={(e: any) => setSelectedDate(e.target.value)} className="w-[180px]" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => markAll('PRESENT')}>{t('attendance.markAllPresent')}</Button>
          <Button variant="outline" size="sm" onClick={() => markAll('ABSENT')}>{t('attendance.markAllAbsent')}</Button>
        </div>
      </div>

      {/* Summary Bar */}
      {marked > 0 && (
        <div className="flex flex-wrap gap-3">
          <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700"><Check className="w-3 h-3" /> Present: {present}</Badge>
          <Badge variant="secondary" className="gap-1 bg-red-100 text-red-700"><X className="w-3 h-3" /> Absent: {absent}</Badge>
          <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700"><Clock className="w-3 h-3" /> Late: {late}</Badge>
          <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700"><AlertCircle className="w-3 h-3" /> Excused: {excused}</Badge>
          <Badge variant="outline">{marked}/{students.length} marked</Badge>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {fetching ? (
            <div className="py-12 text-center text-muted-foreground">{t('attendance.loading')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">{t('attendance.student')}</th>
                  <th className="text-left p-3 font-medium">{t('attendance.admNo')}</th>
                  <th className="text-center p-3 font-medium">{t('common.status')}</th>
                </tr></thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t('attendance.noStudents')}</td></tr>
                  ) : students.map((s: any, i: number) => (
                    <tr key={s.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{i + 1}</td>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 font-mono text-xs">{s.admissionNo}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttStatus[]).map((status) => (
                            <button
                              key={status}
                              onClick={() => setAttendance(prev => ({ ...prev, [s.id]: status }))}
                              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                                attendance[s.id] === status ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-muted/80'
                              }`}
                              title={status}
                            >
                              {statusIcon(status)}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {students.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            <CalendarCheck className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save Attendance'}
          </Button>
        </div>
      )}
    </div>
  )
}
