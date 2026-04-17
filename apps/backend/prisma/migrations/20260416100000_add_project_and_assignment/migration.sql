-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "Project" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdBy"   TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "role"      "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- UniqueConstraint on ProjectMember
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- AlterTable TestCase
ALTER TABLE "TestCase"
    ADD COLUMN "projectId"  TEXT,
    ADD COLUMN "assignedTo" TEXT;

-- AlterTable TestSuite
ALTER TABLE "TestSuite"
    ADD COLUMN "projectId" TEXT;

-- AlterTable TestRun
ALTER TABLE "TestRun"
    ADD COLUMN "projectId"  TEXT,
    ADD COLUMN "assignedTo" TEXT;

-- AddForeignKey Project -> User
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey ProjectMember -> Project
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey ProjectMember -> User
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey TestCase -> Project
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TestCase -> User (assignee)
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_assignedTo_fkey"
    FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TestSuite -> Project
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TestRun -> Project
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TestRun -> User (assignee)
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_assignedTo_fkey"
    FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
