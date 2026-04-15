-- AlterTable
ALTER TABLE "TestSuite" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TestSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
