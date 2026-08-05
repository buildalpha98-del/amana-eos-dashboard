import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  CreativeRequestStatus,
  CreativeRequestType,
  TicketPriority,
} from "@prisma/client";
import {
  createWithNumberRetry,
  generateRequestNumber,
} from "@/lib/creative-request/request-number";
import {
  defaultDueDate,
  isBeforeToday,
  isFulfillerRole,
} from "@/lib/creative-request/constants";
import { notifyRequestSubmitted } from "@/lib/creative-request/notify";
import { requestInclude } from "@/lib/creative-request/include";
import { safeAttachmentUrl } from "@/lib/schemas/message-attachments";

// ---------------------------------------------------------------------------
// GET — list. Fulfiller roles see everything (queue); centre roles are
// force-scoped to their own submissions ("My requests").
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.nativeEnum(CreativeRequestStatus).optional(),
  serviceId: z.string().optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const q = parsed.data;

  const where: Record<string, unknown> = {};
  if (q.status) where.status = q.status;
  if (q.serviceId) where.serviceId = q.serviceId;
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.search) {
    where.OR = [
      { requestNumber: { contains: q.search, mode: "insensitive" } },
      { title: { contains: q.search, mode: "insensitive" } },
    ];
  }
  if (!isFulfillerRole(session.user.role)) {
    where.requestedById = session.user.id;
  }

  const requests = await prisma.creativeRequest.findMany({
    where,
    include: requestInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: q.limit,
  });

  return NextResponse.json({ requests });
});

// ---------------------------------------------------------------------------
// POST — create. Any authenticated dashboard role can submit.
// ---------------------------------------------------------------------------

const attachmentSchema = z.object({
  fileName: z.string().min(1).max(300),
  fileUrl: safeAttachmentUrl,
  fileSize: z.number().int().min(0).optional(),
  mimeType: z.string().max(200).optional(),
});

const createBodySchema = z.object({
  title: z.string().min(1).max(300),
  type: z.nativeEnum(CreativeRequestType),
  purpose: z.string().min(1).max(10000),
  exactCopy: z.string().max(10000).optional(),
  sizeSpec: z.string().max(500).optional(),
  outputFormat: z.string().max(500).optional(),
  serviceId: z.string().optional().nullable(),
  priority: z.nativeEnum(TicketPriority).optional(),
  dueDate: z.coerce.date().optional(),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const POST = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
  }
  const data = parsed.data;

  const now = new Date();
  if (data.dueDate && isBeforeToday(data.dueDate)) {
    throw ApiError.badRequest("Due date cannot be in the past");
  }
  const dueDate = data.dueDate ?? defaultDueDate(data.type, now);

  const created = await createWithNumberRetry(
    (requestNumber) =>
      prisma.creativeRequest.create({
        data: {
          requestNumber,
          title: data.title,
          type: data.type,
          purpose: data.purpose,
          exactCopy: data.exactCopy ?? null,
          sizeSpec: data.sizeSpec ?? null,
          outputFormat: data.outputFormat ?? null,
          serviceId: data.serviceId ?? null,
          priority: data.priority ?? "normal",
          dueDate,
          requestedById: session.user.id,
          attachments: {
            create: data.attachments.map((a) => ({
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileSize: a.fileSize ?? null,
              mimeType: a.mimeType ?? null,
              uploadedById: session.user.id,
            })),
          },
        },
        include: requestInclude,
      }),
    () => generateRequestNumber(prisma, now.getFullYear()),
  );

  await notifyRequestSubmitted(prisma, created);

  return NextResponse.json({ request: created }, { status: 201 });
});
