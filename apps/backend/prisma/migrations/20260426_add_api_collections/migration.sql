-- CreateTable
CREATE TABLE "ApiCollection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "variables" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiCollectionTest" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "apiTestId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiCollectionTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiCollection_projectId_idx" ON "ApiCollection"("projectId");
CREATE INDEX "ApiCollectionTest_collectionId_idx" ON "ApiCollectionTest"("collectionId");
CREATE INDEX "ApiCollectionTest_apiTestId_idx" ON "ApiCollectionTest"("apiTestId");
CREATE UNIQUE INDEX "ApiCollectionTest_collectionId_apiTestId_key" ON "ApiCollectionTest"("collectionId", "apiTestId");

ALTER TABLE "ApiCollection" ADD CONSTRAINT "ApiCollection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiCollectionTest" ADD CONSTRAINT "ApiCollectionTest_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ApiCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiCollectionTest" ADD CONSTRAINT "ApiCollectionTest_apiTestId_fkey" FOREIGN KEY ("apiTestId") REFERENCES "ApiTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;