-- Library categories become a per-school list instead of free text.
CREATE TABLE "BookCategory" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BookCategory_schoolId_name_key" ON "BookCategory"("schoolId", "name");
ALTER TABLE "BookCategory" ADD CONSTRAINT "BookCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Book" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Book_categoryId_idx" ON "Book"("categoryId");
ALTER TABLE "Book" ADD CONSTRAINT "Book_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BookCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every distinct free-text category a school already used becomes a row, and its books point at it.
INSERT INTO "BookCategory" ("id", "schoolId", "name")
SELECT md5(random()::text || b."schoolId" || t.name), b."schoolId", t.name
FROM (SELECT DISTINCT "schoolId", btrim("category") AS name FROM "Book" WHERE "category" IS NOT NULL AND btrim("category") <> '') t
JOIN "Book" b ON b."schoolId" = t."schoolId" AND btrim(b."category") = t.name
GROUP BY b."schoolId", t.name;
UPDATE "Book" b SET "categoryId" = c."id" FROM "BookCategory" c WHERE c."schoolId" = b."schoolId" AND c."name" = btrim(b."category") AND b."categoryId" IS NULL;
