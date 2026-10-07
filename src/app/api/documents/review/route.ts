/**
 * GET /api/documents/review — admin-only list of loose documents (no centre,
 * not org-wide, not assigned, not AI knowledge). Since 2026-10-07 these are
 * visible only to admins and their uploader; this list is how they get sorted.
 * Each row carries `looksPersonal` and a `suggestedAssignee` (see
 * src/lib/document-review.ts). Fixes are applied with PATCH /api/documents/[id].
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { AI_KNOWLEDGE_FILE_URL, AI_KNOWLEDGE_URL_SEGMENT } from "@/lib/document-visibility";
import { looksPersonal, suggestAssignee } from "@/lib/document-review";

export const GET = withApiAuth(
  async () => {
    const [docs, users] = await Promise.all([
      prisma.document.findMany({
        where: {
          deleted: false,
          centreId: null,
          allServices: false,
          assignedToId: null,
          NOT: [
            { fileUrl: AI_KNOWLEDGE_FILE_URL },
            { fileUrl: { contains: AI_KNOWLEDGE_URL_SEGMENT } },
          ],
        },
        select: {
          id: true,
          title: true,
          fileName: true,
          fileUrl: true,
          category: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true } },
          folder: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.user.findMany({
        where: { active: true, isCentreAccount: false },
        select: { id: true, name: true },
      }),
    ]);

    const rows = docs
      .map((d) => ({
        ...d,
        looksPersonal: looksPersonal(d),
        suggestedAssignee: suggestAssignee(d, users),
      }))
      // Personal-looking first — those are the ones that matter most.
      .sort((a, b) => Number(b.looksPersonal) - Number(a.looksPersonal));

    return NextResponse.json({ documents: rows, total: rows.length });
  },
  { roles: [...ADMIN_ROLES] },
);
