const path = require('path');
const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');

const dbPath = path.resolve(__dirname, '../apps/backend/prisma/dev.db');
const prisma = new PrismaClient({
  datasources: { db: { url: 'file:' + dbPath } },
});

async function main() {
  const r1 = await prisma.testResult.deleteMany({});
  console.log('Deleted TestResult rows:', r1.count);

  const r2 = await prisma.testRun.deleteMany({});
  console.log('Deleted TestRun rows:', r2.count);

  const r3 = await prisma.testCase.deleteMany({});
  console.log('Deleted TestCase rows:', r3.count);

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
