-- CreateTable
CREATE TABLE "ReportSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRemark" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classTeacherRemark" TEXT,
    "headTeacherRemark" TEXT,
    "conduct" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportSettings_schoolId_key" ON "ReportSettings"("schoolId");

-- CreateIndex
CREATE INDEX "ReportRemark_termId_idx" ON "ReportRemark"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRemark_studentId_termId_key" ON "ReportRemark"("studentId", "termId");

-- AddForeignKey
ALTER TABLE "ReportSettings" ADD CONSTRAINT "ReportSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

