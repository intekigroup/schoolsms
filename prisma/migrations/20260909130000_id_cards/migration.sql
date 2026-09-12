-- CreateTable
CREATE TABLE "IdCardSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdCardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdCardSettings_schoolId_key" ON "IdCardSettings"("schoolId");

-- AddForeignKey
ALTER TABLE "IdCardSettings" ADD CONSTRAINT "IdCardSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
