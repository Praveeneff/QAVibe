-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PermissionAction" AS ENUM (
    'create', 'edit', 'delete', 'assign_self',
    'assign_others', 'execute', 'view_all',
    'view_own', 'view_report'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PermissionResource" AS ENUM (
    'test_case', 'test_run', 'report'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectPermission" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT,
  "role"      TEXT NOT NULL DEFAULT 'tester',
  "resource"  "PermissionResource" NOT NULL,
  "action"    "PermissionAction" NOT NULL,
  "allowed"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS
  "ProjectPermission_projectId_role_resource_action_key"
  ON "ProjectPermission"("projectId", "role", "resource", "action");

-- AddForeignKey
ALTER TABLE "ProjectPermission"
  DROP CONSTRAINT IF EXISTS "ProjectPermission_projectId_fkey";
ALTER TABLE "ProjectPermission"
  ADD CONSTRAINT "ProjectPermission_projectId_fkey"
  FOREIGN KEY ("projectId")
  REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
