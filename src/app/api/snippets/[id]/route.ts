import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const snippet = await prisma.infoSnippet.findUnique({ where: { id } });
  if (!snippet) {
    return NextResponse.json(
      { error: "Snippet not found" },
      { status: 404 },
    );
  }

  await prisma.infoSnippet.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ success: true });
});
