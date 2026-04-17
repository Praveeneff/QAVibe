-- CreateEnum (if not exists)
-- AlterTable User: add tokenUsed, tokenResetAt
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenResetAt" TIMESTAMP(3);

-- CreateTable UserTokenLimit
CREATE TABLE IF NOT EXISTS "UserTokenLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "limitTokens" INTEGER NOT NULL DEFAULT 50000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTokenLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserTokenLimit_userId_projectId_key" ON "UserTokenLimit"("userId", "projectId");

-- AddForeignKey for UserTokenLimit -> User
ALTER TABLE "UserTokenLimit" DROP CONSTRAINT IF EXISTS "UserTokenLimit_userId_fkey";
ALTER TABLE "UserTokenLimit" ADD CONSTRAINT "UserTokenLimit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for UserTokenLimit -> Project
ALTER TABLE "UserTokenLimit" DROP CONSTRAINT IF EXISTS "UserTokenLimit_projectId_fkey";
ALTER TABLE "UserTokenLimit" ADD CONSTRAINT "UserTokenLimit_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable AiGenerationLog: add userId
ALTER TABLE "AiGenerationLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- AddForeignKey for AiGenerationLog -> User
ALTER TABLE "AiGenerationLog" DROP CONSTRAINT IF EXISTS "AiGenerationLog_userId_fkey";
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
