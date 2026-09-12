-- Document numbers are issued per school (JE-2026-00001, EXP-…, RCP-…, PS-<period>-0001),
-- but the unique constraints were platform-wide, so the second school to post an entry,
-- record an expense, issue a receipt or run payroll in a period collided with the first.
DROP INDEX "JournalEntry_number_key";
CREATE UNIQUE INDEX "JournalEntry_schoolId_number_key" ON "JournalEntry"("schoolId", "number");

DROP INDEX "Expense_number_key";
CREATE UNIQUE INDEX "Expense_schoolId_number_key" ON "Expense"("schoolId", "number");

DROP INDEX "Payslip_number_key";
CREATE UNIQUE INDEX "Payslip_runId_number_key" ON "Payslip"("runId", "number");

-- Receipts had no school column at all; take it from the pupil.
ALTER TABLE "FeePayment" ADD COLUMN "schoolId" TEXT;
UPDATE "FeePayment" fp SET "schoolId" = s."schoolId" FROM "Student" s WHERE s."id" = fp."studentId";
ALTER TABLE "FeePayment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "FeePayment_receiptNo_key";
CREATE UNIQUE INDEX "FeePayment_schoolId_receiptNo_key" ON "FeePayment"("schoolId", "receiptNo");
CREATE INDEX "FeePayment_schoolId_paidAt_idx" ON "FeePayment"("schoolId", "paidAt");
