-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

