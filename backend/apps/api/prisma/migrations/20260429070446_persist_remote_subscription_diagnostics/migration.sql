-- AlterTable
ALTER TABLE "NovelAiAccount" ADD COLUMN     "remoteActive" BOOLEAN,
ADD COLUMN     "remoteFixedTrainingStepsLeft" INTEGER,
ADD COLUMN     "remoteMaxPriorityActions" INTEGER,
ADD COLUMN     "remotePurchasedTrainingSteps" INTEGER,
ADD COLUMN     "remoteTier" INTEGER,
ADD COLUMN     "remoteUnlimitedImageGeneration" BOOLEAN;
