-- Amana AI knowledge store (spec §3.1). Hand-written: Prisma cannot emit
-- CREATE EXTENSION or an HNSW index. searchVector is set explicitly by the
-- pipeline (UPDATE … to_tsvector) — there is no trigger, matching DocumentChunk.

CREATE EXTENSION IF NOT EXISTS vector;

-- AiUsage.userId nullable (cron/script embedding runs have no user).
-- The FK (AiUsage_userId_fkey) is unaffected by dropping NOT NULL.
ALTER TABLE "AiUsage" ALTER COLUMN "userId" DROP NOT NULL;

-- Enums
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('sharepoint','policy_upload','help_article','handbook','lms_module','centre_facts','regulator','manual');
CREATE TYPE "KnowledgeCategory"   AS ENUM ('policy','procedure','sop','guide','reference','centre');
CREATE TYPE "KnowledgeTier"       AS ENUM ('safety_critical','general');
CREATE TYPE "KnowledgeStatus"     AS ENUM ('active','superseded','excluded');

-- KnowledgeSource
CREATE TABLE "KnowledgeSource" (
  "id"              TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "sourceKind"      "KnowledgeSourceKind" NOT NULL,
  "category"        "KnowledgeCategory" NOT NULL,
  "tier"            "KnowledgeTier" NOT NULL DEFAULT 'general',
  "tierOverride"    "KnowledgeTier",
  "qualityArea"     INTEGER,
  "serviceId"       TEXT,
  "state"           TEXT,
  "audienceRoles"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "version"         INTEGER,
  "externalId"      TEXT NOT NULL,
  "externalUrl"     TEXT,
  "text"            TEXT NOT NULL DEFAULT '',
  "contentHash"     TEXT NOT NULL,
  "status"          "KnowledgeStatus" NOT NULL DEFAULT 'active',
  "excludedBy"      TEXT,
  "supersededById"  TEXT,
  "indexedAt"       TIMESTAMP(3),
  "indexError"      TEXT,
  "embedded"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeSource_sourceKind_externalId_key" ON "KnowledgeSource"("sourceKind","externalId");
CREATE INDEX "KnowledgeSource_status_tier_idx" ON "KnowledgeSource"("status","tier");
CREATE INDEX "KnowledgeSource_serviceId_idx" ON "KnowledgeSource"("serviceId");
CREATE INDEX "KnowledgeSource_normalizedTitle_state_serviceId_idx" ON "KnowledgeSource"("normalizedTitle","state","serviceId");
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KnowledgeChunk
CREATE TABLE "KnowledgeChunk" (
  "id"           TEXT NOT NULL,
  "sourceId"     TEXT NOT NULL,
  "chunkIndex"   INTEGER NOT NULL,
  "heading"      TEXT,
  "content"      TEXT NOT NULL,
  "tokenCount"   INTEGER NOT NULL,
  "searchVector" tsvector,
  "embedding"    vector(1024),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeChunk_sourceId_chunkIndex_key" ON "KnowledgeChunk"("sourceId","chunkIndex");
CREATE INDEX "KnowledgeChunk_searchVector_idx" ON "KnowledgeChunk" USING GIN ("searchVector");
CREATE INDEX "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KnowledgeSyncRun
CREATE TABLE "KnowledgeSyncRun" (
  "id"          TEXT NOT NULL,
  "adapter"     TEXT NOT NULL,
  "startedById" TEXT,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),
  "cursor"      TEXT,
  "counts"      JSONB NOT NULL,
  "details"     JSONB NOT NULL,
  "error"       TEXT,
  CONSTRAINT "KnowledgeSyncRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeSyncRun_adapter_startedAt_idx" ON "KnowledgeSyncRun"("adapter","startedAt");

-- AssistantTurn (written from slice 2; created now so the schema is complete)
CREATE TABLE "AssistantTurn" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "serviceId"    TEXT,
  "mode"         TEXT NOT NULL,
  "message"      TEXT NOT NULL,
  "chunkIds"     TEXT[],
  "toolCalls"    JSONB NOT NULL,
  "inputTokens"  INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantTurn_userId_createdAt_idx" ON "AssistantTurn"("userId","createdAt");
CREATE INDEX "AssistantTurn_createdAt_idx" ON "AssistantTurn"("createdAt");
