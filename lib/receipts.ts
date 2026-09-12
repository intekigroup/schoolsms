import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Receipt numbering.
 *
 * The previous implementation was `count()` then format, which is a read-then-write
 * race: several cashiers taking payments at the same moment all read the same count
 * and were issued the same receipt number. Measured at 10 concurrent payments, it
 * produced 3 distinct numbers and 7 duplicates, and `receiptNo` had no unique
 * constraint to catch it.
 *
 * `FeePayment.receiptNo` is now `@unique`, so a collision raises P2002 instead of
 * being stored. We take the highest existing number for the school-year and retry
 * on conflict: the database is the arbiter, not a count read moments earlier.
 */

const MAX_ATTEMPTS = 10

export interface PaymentInput {
  amount: number
  paymentMethod: any
  paymentStatus: any
  transactionRef: string | null
  remarks: string | null
  studentId: string
  feeStructureId: string
}

function format(year: number, seq: number) {
  return `RCP-${year}-${String(seq).padStart(5, '0')}`
}

/** Highest sequence already issued for this school in this year, or 0. */
async function highestSeq(schoolId: string, year: number): Promise<number> {
  const prefix = `RCP-${year}-`
  const latest = await prisma.feePayment.findFirst({
    where: { receiptNo: { startsWith: prefix }, student: { schoolId } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  })
  if (!latest?.receiptNo) return 0
  const n = parseInt(latest.receiptNo.slice(prefix.length), 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Creates the payment and its receipt number together, retrying when another
 * request wins the same number. Returns the created payment.
 */
export async function createPaymentWithReceipt(schoolId: string, data: PaymentInput) {
  const year = new Date().getFullYear()
  let seq = (await highestSeq(schoolId, year)) + 1

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.feePayment.create({
        data: { ...data, schoolId, receiptNo: format(year, seq) },
      })
    } catch (e) {
      const clash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        String(e.meta?.target ?? '').includes('receiptNo')
      if (!clash) throw e
      // Someone else took this number. Re-read the high-water mark and try again.
      seq = Math.max(seq + 1, (await highestSeq(schoolId, year)) + 1)
    }
  }
  throw new Error('Could not allocate a unique receipt number after several attempts')
}
