CREATE TABLE "ErrorLog" (
  "id" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "message" TEXT NOT NULL, "stack" TEXT, "digest" TEXT,
  "path" TEXT, "method" TEXT, "kind" TEXT, "userId" TEXT, "schoolId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_fingerprint_createdAt_idx" ON "ErrorLog"("fingerprint", "createdAt");
