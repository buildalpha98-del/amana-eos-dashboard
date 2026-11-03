-- AlterTable
ALTER TABLE "Passkey" ADD COLUMN     "label" TEXT NOT NULL DEFAULT 'Passkey';

-- AlterTable
ALTER TABLE "PasskeyChallenge" ADD COLUMN     "label" TEXT;

-- CreateTable
CREATE TABLE "PasskeyRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasskeyRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyRecoveryCode_digest_key" ON "PasskeyRecoveryCode"("digest");

-- CreateIndex
CREATE INDEX "PasskeyRecoveryCode_userId_idx" ON "PasskeyRecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "PasskeyRecoveryCode" ADD CONSTRAINT "PasskeyRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

