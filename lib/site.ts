import { normaliseTzPhone } from '@/lib/sms/types'

/**
 * Public details for the marketing site. One place to change them;
 * CONTACT_PHONE / CONTACT_EMAIL / APP_URL / COMPANY_* in .env override the defaults.
 */
const RAW_PHONE = process.env.CONTACT_PHONE || '+255745389941'

/** E.164 digits, e.g. 255745389941 — what tel: and wa.me links want. */
export const CONTACT_MSISDN = normaliseTzPhone(RAW_PHONE) ?? RAW_PHONE.replace(/\D/g, '')

/** Human form, grouped the way Tanzanians write it: +255 745 389 941 */
export const CONTACT_PHONE_DISPLAY = CONTACT_MSISDN.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4')

export const CONTACT_TEL_HREF = `tel:+${CONTACT_MSISDN}`
export const CONTACT_WHATSAPP_HREF = `https://wa.me/${CONTACT_MSISDN}?text=${encodeURIComponent('Habari, I would like to know more about Shule SMS for my school.')}`
/** Pre-filled "book a demo" message — the conversion path most schools actually take. */
export const DEMO_WHATSAPP_HREF = `https://wa.me/${CONTACT_MSISDN}?text=${encodeURIComponent('Habari, naomba demo ya Shule SMS kwa shule yetu. / Hello, I would like a demo of Shule SMS for our school.')}`

export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'info@intekigroup.co.tz'

/** Canonical public origin — used for metadataBase, sitemap and robots. */
export const SITE_URL = (process.env.APP_URL || 'https://school.intekigroup.co.tz').replace(/\/$/, '')

/** The company behind the product. Address/registration are set in .env so nothing is invented. */
export const COMPANY_NAME = process.env.COMPANY_NAME || 'INTEKI Group'
export const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || 'Tanzania'
export const COMPANY_REGISTRATION = process.env.COMPANY_REGISTRATION || ''

/** Demo school shown on /demo. Read-mostly roles only; the admin demo is given on request. */
export const DEMO_LOGINS = [
  { role: 'Teacher', email: 'amina@kilimanjaro.tz', password: 'teacher123', note: 'Class teacher of Std 5 — registers, mark sheets, timetable, homework, messages' },
  { role: 'Parent', email: 'parent@kilimanjaro.tz', password: 'parent123', note: 'Two children — progress, fees, homework, messages with the teacher' },
  { role: 'Pupil', email: 'pupil@kilimanjaro.tz', password: 'pupil123', note: 'Baraka, Std 5 — results, timetable, homework, fee balance' },
  { role: 'Accountant', email: 'rose@kilimanjaro.tz', password: 'accountant123', note: 'Fees, receipts, ledger and financial statements' },
]
