import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { generateEnrolmentPdf } from "@/lib/enrolment-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

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
}
