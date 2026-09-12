-- Sibling discount: a per-school policy, applied to fees flagged as discountable.
CREATE TABLE "FeeSettings" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "siblingSecondPct" INTEGER NOT NULL DEFAULT 0,
  "siblingThirdPct" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeeSettings_schoolId_key" ON "FeeSettings"("schoolId");
ALTER TABLE "FeeSettings" ADD CONSTRAINT "FeeSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD COLUMN "discountable" BOOLEAN NOT NULL DEFAULT true;
