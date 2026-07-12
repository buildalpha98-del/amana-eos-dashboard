import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { serviceScopeFilter } from "@/lib/authz-scope";
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Centre-scope: non-admins only see their own service's submissions
  // (child/parent DOB, address, CRN, medical); admins see all centres.
  const where = { ...serviceScopeFilter(session), ...(status ? { status } : {}) };

  const [submissions, total] = await Promise.all([
    prisma.enrolmentSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.enrolmentSubmission.count({ where }),
  ]);

  return NextResponse.json({ submissions, total });
});
