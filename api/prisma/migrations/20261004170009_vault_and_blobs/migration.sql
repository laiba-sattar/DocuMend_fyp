-- CreateTable
CREATE TABLE "UserVault" (
    "userId" TEXT NOT NULL,
    "passSalt" TEXT NOT NULL,
    "passIv" TEXT NOT NULL,
    "wrappedByPass" TEXT NOT NULL,
    "recSalt" TEXT NOT NULL,
    "recIv" TEXT NOT NULL,
    "wrappedByRecovery" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVault_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DocumentBlob" (
    "docId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "iv" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("docId")
);

-- CreateIndex
CREATE INDEX "DocumentBlob_userId_idx" ON "DocumentBlob"("userId");

-- AddForeignKey
ALTER TABLE "UserVault" ADD CONSTRAINT "UserVault_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBlob" ADD CONSTRAINT "DocumentBlob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
