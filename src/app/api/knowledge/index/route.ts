import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";
import { z } from "zod";

const bodySchema = z.object({
  documentId: z.string().min(1, "documentId is required"),
});

/**
 * POST /api/knowledge/index — Index a single document
 *
 * Body: { documentId: string }
 * Auth: owner, head_office, admin
 */
export const POST = withApiAuth(
  async (req) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }

    const { documentId } = parsed.data;

    logger.info("Knowledge: indexing document", { documentId });
    await indexDocument(documentId);

    const chunksCreated = await prisma.documentChunk.count({
      where: { documentId },
    });

    return NextResponse.json({
      success: true,
      documentId,
      chunksCreated,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
