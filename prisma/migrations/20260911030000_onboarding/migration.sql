-- AlterTable
ALTER TABLE "School" ADD COLUMN     "approxPupils" INTEGER,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "onboarding" JSONB,
ADD COLUMN     "preferredLocale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "referralSource" TEXT,
ADD COLUMN     "schoolType" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "phone" TEXT;

