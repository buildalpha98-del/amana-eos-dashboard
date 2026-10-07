/**
 * GET /api/documents/staff-folders/[userId] — admin-only: everything in one
 * staff member's virtual folder (see ../route.ts). File links go through
 * the existing authorised proxies — /api/staff-documents/[id],
 * /api/compliance/[id]/download, /api/contracts/[id]/document — never raw
 * blob URLs.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { userId } = await context!.params!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatar: true, service: { select: { name: true } } },
    });
    if (!user) throw ApiError.notFound("Staff member not found");

    const [documents, certificates, contracts] = await Promise.all([
      prisma.document.findMany({
        where: { deleted: false, assignedToId: userId },
        select: { id: true, title: true, fileName: true, category: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.complianceCertificate.findMany({
        where: { userId, fileUrl: { not: null }, supersededAt: null },
        select: { id: true, type: true, label: true, fileName: true, expiryDate: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employmentContract.findMany({
        where: { userId, documentUrl: { not: null } },
        select: { id: true, contractType: true, status: true, startDate: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      user: { id: user.id, name: user.name, avatar: user.avatar, serviceName: user.service?.name ?? null },
      items: [
        ...contracts.map((c) => ({
          kind: "contract" as const,
          id: c.id,
          title: `Employment contract (${String(c.contractType).replace(/_/g, " ")})`,
          detail: c.status === "active" ? "Current" : String(c.status).replace(/_/g, " "),
          date: c.startDate ?? c.createdAt,
          href: `/api/contracts/${c.id}/document`,
        })),
        ...certificates.map((c) => ({
          kind: "certificate" as const,
          id: c.id,
          title: c.label || String(c.type).replace(/_/g, " "),
          detail: c.expiryDate ? `Expires ${c.expiryDate.toISOString().slice(0, 10)}` : "No expiry",
          date: c.createdAt,
          href: `/api/compliance/${c.id}/download`,
        })),
        ...documents.map((d) => ({
          kind: "document" as const,
          id: d.id,
          title: d.title,
          detail: String(d.category),
          date: d.createdAt,
          href: `/api/staff-documents/${d.id}`,
        })),
      ],
    });
  },
  { roles: [...ADMIN_ROLES] },
);
