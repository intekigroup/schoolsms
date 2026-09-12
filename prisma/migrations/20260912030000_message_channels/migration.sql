-- Direct messages can also go out as SMS / email; the outbound log covers both channels.
ALTER TABLE "Message" ADD COLUMN "viaSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN "viaEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN "delivery" TEXT;
ALTER TABLE "SmsLog" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'sms';
ALTER TABLE "SmsLog" ADD COLUMN "subject" TEXT;
CREATE INDEX "SmsLog_schoolId_channel_createdAt_idx" ON "SmsLog"("schoolId", "channel", "createdAt");
