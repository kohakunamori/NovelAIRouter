-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN "intermediateOutputCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "intermediateOutputSseBytes" INTEGER NOT NULL DEFAULT 0;
