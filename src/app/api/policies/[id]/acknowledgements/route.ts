import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const ADMIN_ROLES = ["owner", "head_office", "admin"] as const;

// GET /api/policies/[id]/acknowledgements — admin view of every
// acknowledgement across every version, plus a summary line for the
// current version: "X of Y staff have acknowledged vN".
export const GET = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const doc = await prisma.policyDocument.findUnique({
      where: { id },
      include: {
        currentVersion: { select: { id: true, versionNumber: true } },
      },
    });
    if (!doc) throw ApiError.notFound("Policy not found");

    const acks = await prisma.policyDocumentAcknowledgement.findMany({
      where: { version: { documentId: id } },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        version: { select: { id: true, versionNumber: true } },
      },
      orderBy: { acknowledgedAt: "desc" },
    });

    const totalStaff = await prisma.user.count({
      where: { active: true, role: { not: "marketing" } },
    });

    const currentVersionAcked = doc.currentVersionId
      ? acks.filter((a) => a.version.id === doc.currentVersionId).length
      : 0;

    return NextResponse.json({
      documentId: doc.id,
      currentVersionNumber: doc.currentVersion?.versionNumber ?? null,
      totalStaff,
      currentVersionAcked,
      acknowledgements: acks.map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: a.user.name,
        userEmail: a.user.email,
        userAvatar: a.user.avatar,
        versionId: a.versionId,
        versionNumber: a.version.versionNumber,
        acknowledgedAt: a.acknowledgedAt,
      })),
    });
  },
  { roles: [...ADMIN_ROLES] },
);
