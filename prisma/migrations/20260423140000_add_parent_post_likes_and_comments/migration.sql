-- CreateTable
CREATE TABLE "ParentPostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "likerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentAuthorId" TEXT,
    "staffAuthorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentPostLike_postId_idx" ON "ParentPostLike"("postId");

-- CreateIndex
CREATE INDEX "ParentPostLike_likerId_idx" ON "ParentPostLike"("likerId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentPostLike_postId_likerId_key" ON "ParentPostLike"("postId", "likerId");

-- CreateIndex
CREATE INDEX "ParentPostComment_postId_createdAt_idx" ON "ParentPostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "ParentPostComment_parentAuthorId_idx" ON "ParentPostComment"("parentAuthorId");

-- CreateIndex
CREATE INDEX "ParentPostComment_staffAuthorId_idx" ON "ParentPostComment"("staffAuthorId");

-- AddForeignKey
ALTER TABLE "ParentPostLike" ADD CONSTRAINT "ParentPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ParentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentPostLike" ADD CONSTRAINT "ParentPostLike_likerId_fkey" FOREIGN KEY ("likerId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentPostComment" ADD CONSTRAINT "ParentPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ParentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentPostComment" ADD CONSTRAINT "ParentPostComment_parentAuthorId_fkey" FOREIGN KEY ("parentAuthorId") REFERENCES "CentreContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentPostComment" ADD CONSTRAINT "ParentPostComment_staffAuthorId_fkey" FOREIGN KEY ("staffAuthorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
