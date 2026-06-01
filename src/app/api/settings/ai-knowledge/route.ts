/**
 * GET  /api/settings/ai-knowledge — list knowledge entries (admin)
 * POST /api/settings/ai-knowledge — create + index a new entry (admin)
 *
 * Knowledge entries are plain-text snippets the AI bot indexes for
 * retrieval. They live in the Document table with a sentinel fileUrl
 * (`internal://knowledge`) so they sit alongside file uploads but are
 * filterable. Body content is chunked + searchable via the same
 * search_knowledge_base tool the assistant already uses.
 *
 * 2026-06-02.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { indexTextContent } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

// Sentinel + constants. The fileUrl prefix lets us distinguish
// knowledge entries from genuine file uploads. fileName is required
// by the schema; we set it from the title.
const KNOWLEDGE_FILE_URL = "internal://knowledge";
const KNOWLEDGE_MIME_TYPE = "text/plain";
// 500 KB cap on the raw body — generous (~125k words). Caps the
// runaway-paste case so a copy-paste from a 200-page PDF doesn't
// blow out a single Document row.
const MAX_BODY_BYTES = 500_000;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

export const GET = withApiAuth(
  async () => {
    const entries = await prisma.document.findMany({
      where: { fileUrl: KNOWLEDGE_FILE_URL },
      select: {
        id: true,
        title: true,
        description: true,
        indexed: true,
        indexedAt: true,
        indexError: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ entries });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid");
    }
    const { title, body } = parsed.data;

    if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
      throw ApiError.badRequest(
        `Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`,
      );
    }

    const created = await prisma.document.create({
      data: {
        title: title.trim(),
        // First 280 chars of the body acts as a preview/description
        // for the index card. Updated whenever the body changes.
        description: body.slice(0, 280),
        category: "other",
        fileName: `${title.trim().toLowerCase().replace(/\s+/g, "-")}.txt`,
        fileUrl: KNOWLEDGE_FILE_URL,
        fileSize: Buffer.byteLength(body, "utf-8"),
        mimeType: KNOWLEDGE_MIME_TYPE,
        uploadedById: session!.user.id,
      },
    });

    // Index synchronously — these are small text snippets, no need to
    // background. If indexing fails it's flagged on the document via
    // indexError and the admin sees the warning on the list page.
    await indexTextContent(created.id, body);

    logger.info("AI knowledge entry created", {
      id: created.id,
      title: created.title,
      byteSize: Buffer.byteLength(body, "utf-8"),
      actorId: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
