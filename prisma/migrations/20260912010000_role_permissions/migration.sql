-- Per-school adjustments to the default role permissions.
CREATE TABLE "RolePermission" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "capability" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_schoolId_role_capability_key" ON "RolePermission"("schoolId", "role", "capability");
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
