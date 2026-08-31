-- CreateTable
CREATE TABLE "HelpCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'book-open',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpCategory_slug_key" ON "HelpCategory"("slug");

-- CreateIndex
CREATE INDEX "HelpCategory_published_sortOrder_idx" ON "HelpCategory"("published", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE INDEX "HelpArticle_categoryId_published_sortOrder_idx" ON "HelpArticle"("categoryId", "published", "sortOrder");

-- CreateIndex
CREATE INDEX "HelpArticle_published_viewCount_idx" ON "HelpArticle"("published", "viewCount");

-- AddForeignKey
ALTER TABLE "HelpArticle" ADD CONSTRAINT "HelpArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HelpCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

