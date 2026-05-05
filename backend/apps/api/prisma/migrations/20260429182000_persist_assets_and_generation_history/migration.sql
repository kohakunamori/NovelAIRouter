-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('REFERENCE_IMAGE', 'GENERATED_IMAGE');

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "estimatedNovelAiAnlas" INTEGER;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "originalFilename" TEXT,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationOutput" (
    "id" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_userId_kind_createdAt_idx" ON "Asset"("userId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationOutput_generationJobId_index_key" ON "GenerationOutput"("generationJobId", "index");

-- CreateIndex
CREATE INDEX "GenerationOutput_assetId_idx" ON "GenerationOutput"("assetId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationOutput" ADD CONSTRAINT "GenerationOutput_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationOutput" ADD CONSTRAINT "GenerationOutput_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
