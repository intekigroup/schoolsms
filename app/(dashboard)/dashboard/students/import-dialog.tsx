'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Upload, FileDown, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n-context'

/** Import the whole roll from a CSV (saved from Excel): preview first, then import. */
export function StudentImportDialog() {
  const router = useRouter()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)

  const pick = async (f: File | undefined) => { if (!f) return; setFileName(f.name); setText(await f.text()); setPreview(null); setResult(null) }
  const run = async (dry: boolean) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/students/import${dry ? '?dryRun=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text })
      const d = await r.json().catch(() => ({}))
      if (!r.ok && !d.errors) { toast.error(d?.error ?? 'Import failed'); return }
      if (dry) setPreview(d); else { setResult(d); if (d.imported) { toast.success(`${d.imported} pupils imported`); router.refresh() } }
    } finally { setBusy(false) }
  }
  const reset = () => { setText(''); setFileName(''); setPreview(null); setResult(null) }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild><Button variant="outline" className="gap-2"><Upload className="w-4 h-4" /> {t('students.import')}</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import pupils</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Download the template and fill it in Excel (or copy your columns to match): admission no, first name, last name, gender M/F, date of birth, class, guardian name, guardian phone, relationship.</li>
            <li>Save as <strong>CSV</strong> and choose the file below. Classes that do not exist yet are created; a guardian with the same phone is reused for siblings.</li>
            <li>Check the preview, then import.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5"><a href="/api/students/import?template=1"><FileDown className="w-4 h-4" /> Download template</a></Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><Upload className="w-4 h-4" /> {fileName || 'Choose CSV file'}<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} /></label>
            {text && !preview && !result && <Button size="sm" onClick={() => run(true)} disabled={busy}>{busy ? 'Checking…' : 'Preview'}</Button>}
          </div>
          {preview && !result && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {preview.importable} pupil(s) ready to import{preview.newClasses?.length ? ` · ${preview.newClasses.length} new class(es): ${preview.newClasses.join(', ')}` : ''}</p>
              {preview.errors?.length > 0 && <div><p className="flex items-center gap-2 text-amber-700"><AlertTriangle className="w-4 h-4" /> {preview.errors.length} row(s) will be skipped:</p><ul className="mt-1 max-h-40 overflow-y-auto text-xs text-muted-foreground">{preview.errors.slice(0, 50).map((e: any) => <li key={e.line}>Line {e.line}: {e.error}</li>)}</ul></div>}
              <div className="flex gap-2"><Button size="sm" onClick={() => run(false)} disabled={busy || preview.importable === 0}>{busy ? 'Importing…' : `Import ${preview.importable} pupils`}</Button><Button size="sm" variant="ghost" onClick={reset}>Choose another file</Button></div>
            </div>
          )}
          {result && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Imported {result.imported} pupil(s){result.guardiansCreated ? `, ${result.guardiansCreated} guardian(s) created` : ''}{result.guardiansReused ? `, ${result.guardiansReused} reused` : ''}.</p>
              {result.errors?.length > 0 && <p className="text-xs text-muted-foreground">{result.errors.length} row(s) skipped — fix them in the file and import again; existing pupils are never duplicated.</p>}
              <Button size="sm" variant="outline" onClick={() => { setOpen(false); reset() }}>Done</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
