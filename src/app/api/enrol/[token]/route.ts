import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const GET = withApiHandler(async (_req, context) => {
  try {
    const ip = _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`enrol-prefill:${ip}`, 10, 15 * 60 * 1000);
    if (rl.limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { token } = await context!.params!;

    // Look up the enquiry by ID (token = enquiry ID)
    const enquiry = await prisma.parentEnquiry.findUnique({
      where: { id: token },
      select: {
        id: true,
        parentName: true,
        parentEmail: true,
        parentPhone: true,
        childName: true,
        childrenDetails: true,
        serviceId: true,
      },
    });

    if (!enquiry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Pre-fill parent and child details
    const nameParts = (enquiry.parentName || "").split(" ");
    const firstName = nameParts[0] || "";
    const surname = nameParts.slice(1).join(" ") || "";

    // Build children from childrenDetails JSON or fallback to childName
    const childrenDetails = enquiry.childrenDetails as
      | { name: string; age: string }[]
      | null;
    const children = childrenDetails?.length
      ? childrenDetails.map((c) => ({
          firstName: c.name.split(" ")[0] || c.name,
          surname: c.name.split(" ").slice(1).join(" ") || surname,
          dob: "",
          gender: "",
          street: "",
          suburb: "",
          state: "",
          postcode: "",
          culturalBackground: [],
          schoolName: "",
          yearLevel: "",
          crn: "",
        }))
      : enquiry.childName
      ? [
          {
            firstName: enquiry.childName.split(" ")[0] || enquiry.childName,
            surname:
              enquiry.childName.split(" ").slice(1).join(" ") || surname,
            dob: "",
            gender: "",
            street: "",
            suburb: "",
            state: "",
            postcode: "",
            culturalBackground: [],
            schoolName: "",
            yearLevel: "",
            crn: "",
          },
        ]
      : undefined;

    const prefill: Record<string, unknown> = {
      primaryParent: {
        firstName,
        surname,
        dob: "",
        email: enquiry.parentEmail || "",
        mobile: enquiry.parentPhone || "",
        street: "",
        suburb: "",
        state: "",
        postcode: "",
        relationship: "",
        occupation: "",
        workplace: "",
        workPhone: "",
        crn: "",
      },
    };

    if (children) {
      prefill.children = children;
    }

    return NextResponse.json(prefill);
  } catch (e) {
    logger.error("Enrol prefill error", { e });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
