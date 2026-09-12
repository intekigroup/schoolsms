-- CreateTable
CREATE TABLE "SeatPlan" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 5,
    "cols" INTEGER NOT NULL DEFAULT 6,
    "seats" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeatPlan_classId_key" ON "SeatPlan"("classId");

-- AddForeignKey
ALTER TABLE "SeatPlan" ADD CONSTRAINT "SeatPlan_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

