import type { Metadata } from 'next'
import { Landing } from '@/components/marketing/landing'

export const metadata: Metadata = {
  title: { absolute: 'Shule SMS — Mfumo wa usimamizi wa shule binafsi Tanzania' },
  description:
    'Mahudhurio, alama, ada kwa shilingi, SMS kwa wazazi, ripoti za wanafunzi, mishahara yenye PAYE na NSSF, na uhasibu. Imejengwa kwa jinsi shule za Tanzania zinavyofanya kazi, kuanzia chekechea hadi kidato cha sita.',
  alternates: { canonical: '/sw', languages: { en: '/', sw: '/sw' } },
  openGraph: { locale: 'sw_TZ' },
}

/** Kiswahili landing page — same page, Kiswahili copy. */
export default function LandingSwPage() {
  return <Landing locale="sw" />
}
