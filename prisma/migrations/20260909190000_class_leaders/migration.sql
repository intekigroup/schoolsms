-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "monitorId" TEXT,
ADD COLUMN     "monitressId" TEXT;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_monitressId_fkey" FOREIGN KEY ("monitressId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

