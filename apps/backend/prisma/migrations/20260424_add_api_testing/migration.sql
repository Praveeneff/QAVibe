-- CreateTable
CREATE TABLE "ApiTest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "queryParams" JSONB,
    "body" JSONB,
    "assertions" JSONB[] NOT NULL,
    "suiteId" TEXT,
    "variables" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiExecution" (
    "id" TEXT NOT NULL,
    "apiTestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseTime" INTEGER,
    "responseHeaders" JSONB,
    "responseBody" JSONB,
    "assertionResults" JSONB[] NOT NULL,
    "error" TEXT,
    "errorStack" TEXT,
    "environment" TEXT,
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiTest_projectId_idx" ON "ApiTest"("projectId");

-- CreateIndex
CREATE INDEX "ApiTest_suiteId_idx" ON "ApiTest"("suiteId");

-- CreateIndex
CREATE INDEX "ApiExecution_apiTestId_idx" ON "ApiExecution"("apiTestId");

-- CreateIndex
CREATE INDEX "ApiExecution_executedAt_idx" ON "ApiExecution"("executedAt");

-- AddForeignKey
ALTER TABLE "ApiTest" ADD CONSTRAINT "ApiTest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiTest" ADD CONSTRAINT "ApiTest_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiExecution" ADD CONSTRAINT "ApiExecution_apiTestId_fkey" FOREIGN KEY ("apiTestId") REFERENCES "ApiTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;