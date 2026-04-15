-- AlterTable: add tcId column without unique constraint first
ALTER TABLE "TestCase" ADD COLUMN IF NOT EXISTS "tcId" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows with unique TC-XXXX values based on row order
UPDATE "TestCase"
SET "tcId" = 'TC-' || LPAD(row_number::TEXT, 4, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS row_number
  FROM "TestCase"
  WHERE "tcId" = ''
) ranked
WHERE "TestCase".id = ranked.id;

-- Now add unique constraint (all values are now distinct)
CREATE UNIQUE INDEX "TestCase_tcId_key" ON "TestCase"("tcId");
