-- CreateTable
CREATE TABLE "UserPromptChunkLibrary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "libraryJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPromptChunkLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPromptChunkLibrary_userId_key" ON "UserPromptChunkLibrary"("userId");

-- CreateIndex
CREATE INDEX "UserPromptChunkLibrary_updatedAt_idx" ON "UserPromptChunkLibrary"("updatedAt");

-- AddForeignKey
ALTER TABLE "UserPromptChunkLibrary" ADD CONSTRAINT "UserPromptChunkLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
