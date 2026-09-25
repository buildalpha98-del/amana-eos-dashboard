-- CreateTable
CREATE TABLE "ParentPasswordReset" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "issuedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentPasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentPasswordReset_tokenHash_key" ON "ParentPasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "ParentPasswordReset_email_idx" ON "ParentPasswordReset"("email");

-- CreateIndex
CREATE INDEX "ParentPasswordReset_tokenHash_idx" ON "ParentPasswordReset"("tokenHash");

