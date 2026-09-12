-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'PART_TIME', 'VOLUNTEER', 'INTERN');

-- CreateEnum
CREATE TYPE "PayItemKind" AS ENUM ('ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- AlterEnum
ALTER TYPE "LeaveStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'ANNUAL';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "contractEnd" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "nssfNo" TEXT,
ADD COLUMN     "tin" TEXT;

-- CreateTable
CREATE TABLE "StaffPayItem" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PayItemKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPayItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "totalBasic" INTEGER NOT NULL DEFAULT 0,
    "totalGross" INTEGER NOT NULL DEFAULT 0,
    "totalPaye" INTEGER NOT NULL DEFAULT 0,
    "totalNssfEmployee" INTEGER NOT NULL DEFAULT 0,
    "totalNssfEmployer" INTEGER NOT NULL DEFAULT 0,
    "totalSdl" INTEGER NOT NULL DEFAULT 0,
    "totalWcf" INTEGER NOT NULL DEFAULT 0,
    "totalDeductions" INTEGER NOT NULL DEFAULT 0,
    "totalNet" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "basic" INTEGER NOT NULL,
    "allowances" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "gross" INTEGER NOT NULL,
    "taxablePay" INTEGER NOT NULL,
    "nssfEmployee" INTEGER NOT NULL,
    "nssfEmployer" INTEGER NOT NULL,
    "paye" INTEGER NOT NULL,
    "otherDeductions" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "sdl" INTEGER NOT NULL,
    "wcf" INTEGER NOT NULL,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "nssfNo" TEXT,
    "tin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffPayItem_staffId_idx" ON "StaffPayItem"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_schoolId_period_key" ON "PayrollRun"("schoolId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_number_key" ON "Payslip"("number");

-- CreateIndex
CREATE INDEX "Payslip_staffId_idx" ON "Payslip"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_staffId_key" ON "Payslip"("runId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "HrSettings_schoolId_key" ON "HrSettings"("schoolId");

-- CreateIndex
CREATE INDEX "LeaveRequest_staffId_startDate_idx" ON "LeaveRequest"("staffId", "startDate");

-- AddForeignKey
ALTER TABLE "StaffPayItem" ADD CONSTRAINT "StaffPayItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrSettings" ADD CONSTRAINT "HrSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

