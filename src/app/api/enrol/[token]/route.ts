/**
 * GET /api/enrol/[token] — prefill for the signup form.
 *
 * The `token` is a `ParentEnquiry` id. It reaches a family through a
 * link in a nurture or waitlist email, which means it also reaches
 * their browser history, any referrer header, and whoever they forward
 * the mail to. It is a bearer credential that nobody treats like one.
 *
 * 2026-08-13 — narrowed. This used to return `parentEmail`,
 * `parentPhone`, `parentName`, `childName` and the whole
 * `childrenDetails` blob, because it fed the old anonymous enrolment
 * wizard, which needed to fill an entire form. That wizard is gone
 * (see src/app/enrol/[token]/page.tsx), and its replacement is the
 * signup form, which needs a name and an email to save the family
 * retyping them.
 *
 * So it returns a name and an email. A phone number and a child's name
 * are no longer given out to anyone holding a link, because nothing
 * asks for them any more.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * How long a prefill link keeps working.
 *
 * The enquiry row lives forever; the link's usefulness does not. Ninety
 * days covers a family who sat on a waitlist email over a school
 * holidays and came back to it, and stops a link found in a forwarded
 * mail two years later still handing out an address.
 */
const PREFILL_TTL_DAYS = 90;

export const GET = withApiHandler(async (req, context) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`enrol-prefill:${ip}`, 10, 15 * 60 * 1000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await context!.params!;

  const enquiry = await prisma.parentEnquiry.findUnique({
    where: { id: token },
    select: {
      id: true,
      parentName: true,
      parentEmail: true,
      createdAt: true,
      deleted: true,
    },
  });

  /**
   * One answer for "no such enquiry", "deleted" and "too old".
   *
   * Distinguishing them would turn this into an oracle: feed it ids and
   * learn which ones are real enquiries, without ever seeing a name.
   */
  const tooOld =
    enquiry &&
    Date.now() - enquiry.createdAt.getTime() >
      PREFILL_TTL_DAYS * 24 * 60 * 60 * 1000;

  if (!enquiry || enquiry.deleted || tooOld) {
    if (tooOld) {
      logger.info("Enrolment prefill link has expired", { enquiryId: token });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nameParts = (enquiry.parentName || "").trim().split(/\s+/);

  return NextResponse.json({
    prefill: {
      firstName: nameParts[0] || "",
      surname: nameParts.slice(1).join(" "),
      email: enquiry.parentEmail ?? "",
    },
  });
});
