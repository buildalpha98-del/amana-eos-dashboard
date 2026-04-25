-- Sprint 3.5 — AI generation cache for hybrid provider (Anthropic + Groq)
-- Stores generated outputs keyed by (kind, inputHash) so identical prompts
-- within the TTL window don't re-hit the model.

CREATE TABLE "AiGenerationCache" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGenerationCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiGenerationCache_kind_inputHash_key"
    ON "AiGenerationCache"("kind", "inputHash");

CREATE INDEX "AiGenerationCache_kind_idx" ON "AiGenerationCache"("kind");
CREATE INDEX "AiGenerationCache_expiresAt_idx" ON "AiGenerationCache"("expiresAt");

ALTER TABLE "AiGenerationCache"
    ADD CONSTRAINT "AiGenerationCache_generatedById_fkey"
    FOREIGN KEY ("generatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
