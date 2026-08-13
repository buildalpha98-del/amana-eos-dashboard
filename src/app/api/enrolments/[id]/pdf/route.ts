import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEnrolmentPdf } from "@/lib/enrolment-pdf";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const submission = await prisma.enrolmentSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /**
   * Wrapped so a rendering failure names itself.
   *
   * This route had no try/catch and no logging, so anything thrown
   * inside the generator reached the client as a bare
   * `{"error":"Internal server error"}` with nothing on the server
   * saying which submission or which field was at fault.
   *
   * The generator reads a dozen `Json` columns through the `as any`
   * below — the declared types on its interface are a hope, not a
   * guarantee — so when one of them holds a shape it didn't expect,
   * this is the only place that can say which enrolment it was.
   */
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = await generateEnrolmentPdf(submission as any);
    const buffer = pdf.output("arraybuffer");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="enrolment-${submission.id}.pdf"`,
      },
    });
  } catch (err) {
    logger.error("Failed to generate enrolment PDF", {
      enrolmentId: submission.id,
      err,
    });
    throw new ApiError(
      500,
      "Couldn't generate this enrolment PDF. It has been logged for review.",
    );
  }
});
