import type { Metadata } from 'next'
import { Landing } from '@/components/marketing/landing'

export const metadata: Metadata = {
  title: { absolute: 'Shule SMS — School management for Tanzanian private schools' },
  description:
    'Registers, marks, fees in shillings, SMS to parents, report cards, payroll with PAYE and NSSF, and proper accounts. Built for how Tanzanian schools actually run, from nursery to Form 6.',
  alternates: { canonical: '/', languages: { en: '/', sw: '/sw' } },
}

export default function LandingPage() {
  return <Landing locale="en" />
}
