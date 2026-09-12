export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record, tzs } from '@/lib/audit'
import { createPaymentWithReceipt } from '@/lib/receipts'
import { postFeePayment } from '@/lib/accounting/ledger'

// Record a fee payment (generates a receipt number)
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.fees, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (!body.studentId || !body.feeStructureId || !body.amount) {
      return NextResponse.json({ error: 'Student, fee type and amount are required' }, { status: 400 })
    }
    // Verify student and fee belong to this school (tenant isolation)
    const student = await prisma.student.findFirst({ where: { id: body.studentId, schoolId } })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const fee = await prisma.feeStructure.findFirst({ where: { id: body.feeStructureId, schoolId } })
    if (!fee) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 })

    const payment = await createPaymentWithReceipt(schoolId, {
      amount: Number(body.amount),
      paymentMethod: body.paymentMethod ?? 'CASH',
      paymentStatus: body.paymentStatus ?? 'COMPLETED',
      transactionRef: body.transactionRef ?? null,
      remarks: body.remarks ?? null,
      studentId: body.studentId,
      feeStructureId: body.feeStructureId,
    })
    const receiptNo = payment.receiptNo

    // Post to the ledger (Dr cash/bank/mobile, Cr fee income). A ledger fault must
    // never lose a receipt, so it is logged and the sync action catches up later.
    try { await postFeePayment(schoolId, payment.id, guard.session.user.id) } catch (e) { console.error('ledger posting failed for receipt', receiptNo, e) }

    await record(guard.session, {
      action: 'create',
      entity: 'FeePayment',
      entityId: payment.id,
      summary: `Recorded ${tzs(payment.amount)} for ${student.firstName} ${student.lastName} (${fee.name}, receipt ${receiptNo})`,
    })

    // Notify the student's linked guardian(s) with portal logins.
    try {
      const guardianUsers = await prisma.studentGuardian.findMany({
        where: { studentId: body.studentId, guardian: { userId: { not: null } } },
        select: { guardian: { select: { userId: true } } },
      })
      const userIds = guardianUsers
        .map((g: any) => g.guardian?.userId)
        .filter((id: string | null): id is string => Boolean(id))
      if (userIds.length > 0) {
        await prisma.notification.createMany({
          data: userIds.map((uid) => ({
            title: '💰 Fee Payment Received',
            message: `A payment of TZS ${Number(body.amount).toLocaleString('en-US')} for ${student.firstName} ${student.lastName} (${fee.name}) was recorded. Receipt ${receiptNo}.`,
            userId: uid,
          })),
        })
      }
    } catch (notifyErr) {
      console.error('Fee payment notification error:', notifyErr)
    }

    return NextResponse.json(payment)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
