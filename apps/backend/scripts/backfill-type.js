const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function mapType(type) {
  switch (type) {
    case "functional":   return { category: "functional",   executionType: "manual" };
    case "e2e":          return { category: "e2e",          executionType: "automated" };
    case "integration":  return { category: "integration",  executionType: "manual" };
    default:             return { category: "functional",   executionType: "manual" };
  }
}

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id, type FROM "TestCase"'
  );

  console.log(`Found ${rows.length} rows to process.`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { category, executionType } = mapType(row.type);

    await prisma.$executeRawUnsafe(
      'UPDATE "TestCase" SET category = ?, executionType = ? WHERE id = ?',
      category,
      executionType,
      row.id
    );

    if (row.type !== "functional" && row.type !== null) {
      console.log(`  [${row.id}] type="${row.type}" → category="${category}", executionType="${executionType}"`);
    }

    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
