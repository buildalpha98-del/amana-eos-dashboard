import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const submission = await prisma.enrolmentSubmission.findUnique({
    where: { token },
    select: {
      status: true,
      children: true,
      primaryParent: true,
      createdAt: true,
      processedAt: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const children = submission.children as { firstName: string; surname: string }[];
  const parent = submission.primaryParent as { firstName: string; surname: string };

  return NextResponse.json({
    status: submission.status,
    childNames: children.map((c) => `${c.firstName} ${c.surname}`).join(", "),
    parentName: `${parent.firstName} ${parent.surname}`,
    createdAt: submission.createdAt.toISOString(),
    processedAt: submission.processedAt?.toISOString() || null,
  });
}
