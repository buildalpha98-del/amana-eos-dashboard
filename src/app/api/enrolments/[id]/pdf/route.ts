import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEnrolmentPdf } from "@/lib/enrolment-pdf";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const submission = await prisma.enrolmentSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await generateEnrolmentPdf(submission as any);
  const buffer = pdf.output("arraybuffer");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="enrolment-${submission.id}.pdf"`,
    },
  });
});
