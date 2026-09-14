import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DocumentCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { indexDocument } from "@/lib/document-indexer";
import { parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["program", "policy", "procedure", "template", "guide", "compliance", "financial", "marketing", "hr", "other"]).default("other"),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  centreId: z.string().optional().nullable(),
  allServices: z.boolean().optional().default(false),
  folderId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  // Optional FK to a staff member this document is *about* (e.g.
  // their employment contract). Distinct from uploadedById (the
  // actor) so admin-uploaded HR docs appear on the staff profile.
  assignedToId: z.string().optional().nullable(),
});

export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const centreId = searchParams.get("centreId");
  const folderId = searchParams.get("folderId");
  const search = searchParams.get("search");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  // Staff/member users can only see documents for their assigned service + company-wide docs
  const isServiceScoped = ["staff", "member"].includes(session!.user.role);
  const staffServiceId = session!.user.serviceId;
  // Owner / admin / head_office. Governs whether personal HR documents are
  // listed here — see the `assignedToId` note on the where clause.
  const isAdmin = isAdminRole(session!.user.role);

  // Coerce the query-string category to the Prisma enum; unknown values are
  // ignored rather than reaching Prisma's where clause.
  const categoryFilter = Object.values(DocumentCategory).find((c) => c === category);

  // Text search lives in its own AND clause, never in the top-level OR.
  //
  // It used to be spread into the same `where.OR` the staff centre-scope
  // rules write to, which made a search *widen* the result set instead of
  // narrowing it: an Educator typing anything into the box got documents
  // from every other centre back, because `{ title: contains }` sat
  // alongside `{ centreId: theirs }` as a sibling OR branch.
  const searchClause: Prisma.DocumentWhereInput | null = search
    ? {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
          { tags: { hasSome: [search] } },
        ],
      }
    : null;

  const where: Prisma.DocumentWhereInput = {
    deleted: false,
    // Personal HR documents are listed to org admins ONLY.
    //
    // `assignedToId` marks a document as being *about* a staff member —
    // their contract, WWCC, performance letter. Leaving these unfiltered is
    // what let any Educator read a colleague's contract: DocumentsTab
    // uploads them with no centreId, so they matched the `{ centreId: null }`
    // org-wide branch below and rendered with a direct blob link.
    //
    // Admins keep one searchable view across everything (they can open any
    // staff profile anyway, so the library adds no access they lack).
    // Everyone else — Educators AND Directors — sees none of them here;
    // a Director reaches their own centre's staff documents through
    // /staff/[id], which enforces the centre check this listing cannot.
    //
    // The condition is deliberately positive-listing: anything that is not
    // a known admin gets the exclusion, so a new role added to the enum is
    // excluded by default rather than silently admitted.
    ...(isAdmin ? {} : { assignedToId: null }),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(folderId === "root" ? { folderId: null } : folderId ? { folderId } : {}),
  };

  // Every extra constraint goes through this one accumulator and is ANDed.
  // The previous shape wrote to `where.OR` from three separate branches,
  // each silently clobbering the last, which is how the centre scope came
  // to be defeated by simply typing in the search box.
  const and: Prisma.DocumentWhereInput[] = [];
  if (searchClause) and.push(searchClause);

  if (isServiceScoped) {
    // Educators and Directors see their own centre plus org-wide docs,
    // never another centre's.
    if (centreId && centreId !== staffServiceId) {
      return NextResponse.json({ documents: [], total: 0, page, totalPages: 0 });
    }
    and.push(
      centreId
        ? // Explicit centre filter narrows to that centre, but org-wide
          // docs stay visible so the library isn't suddenly empty.
          { OR: [{ centreId }, { allServices: true }] }
        : {
            OR: [
              ...(staffServiceId ? [{ centreId: staffServiceId }] : []),
              { centreId: null },
              { allServices: true },
            ],
          },
    );
  } else if (centreId) {
    and.push({ centreId });
  }

  if (and.length) where.AND = and;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        // Whose document this is. Only ever populated for admins (the
        // filter above removes assigned rows for everyone else), and it is
        // what lets the UI label a personal HR file as such instead of
        // burying it among org resources.
        assignedTo: { select: { id: true, name: true } },
        centre: { select: { id: true, name: true, code: true } },
        folder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    documents,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createDocumentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const createData = {
    ...parsed.data,
    // allServices=true means org-wide visibility — clear any stale centreId.
    centreId: parsed.data.allServices ? null : parsed.data.centreId ?? null,
    tags: parsed.data.tags || [],
    uploadedById: session!.user.id,
    assignedToId: parsed.data.assignedToId ?? null,
  };

  const document = await prisma.document.create({
    data: createData,
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      centre: { select: { id: true, name: true, code: true } },
      folder: { select: { id: true, name: true } },
    },
  });

  indexDocument(document.id).catch((err) => {
    logger.warn("Auto-index failed", { documentId: document.id, error: err });
  });

  return NextResponse.json(document, { status: 201 });
});
