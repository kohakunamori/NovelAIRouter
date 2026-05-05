-- CreateEnum
CREATE TYPE "NovelAiAccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'COOLDOWN', 'ERROR');

-- CreateEnum
CREATE TYPE "NovelAiCredentialKind" AS ENUM ('API_TOKEN', 'SESSION_COOKIE', 'CUSTOM_JSON');

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "novelAiAccountId" TEXT;

-- CreateTable
CREATE TABLE "NovelAiAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "NovelAiAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "credentialKind" "NovelAiCredentialKind" NOT NULL,
    "credentialCiphertext" TEXT NOT NULL,
    "credentialIv" TEXT NOT NULL,
    "credentialAuthTag" TEXT NOT NULL,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "maxConcurrentJobs" INTEGER NOT NULL DEFAULT 1,
    "cooldownUntil" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "remoteAccountLabel" TEXT,
    "remoteAnlasBalance" INTEGER,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelAiAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NovelAiAccount_status_priority_idx" ON "NovelAiAccount"("status", "priority");

-- CreateIndex
CREATE INDEX "NovelAiAccount_cooldownUntil_idx" ON "NovelAiAccount"("cooldownUntil");

-- CreateIndex
CREATE INDEX "GenerationJob_novelAiAccountId_idx" ON "GenerationJob"("novelAiAccountId");

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_novelAiAccountId_fkey" FOREIGN KEY ("novelAiAccountId") REFERENCES "NovelAiAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
