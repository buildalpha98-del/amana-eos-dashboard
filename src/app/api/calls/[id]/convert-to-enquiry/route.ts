/**
 * POST /api/calls/[id]/convert-to-enquiry
 *
 * Manually convert any call into a ParentEnquiry. Useful for calls that were
 * classified as general_message but were actually new enrolment enquiries.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { createEnquiryFromCall } from "@/lib/vapi/create-enquiry-from-call";
import { prisma } from "@/lib/prisma";

export const POST = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;
  if (!id) throw ApiError.badRequest("Missing call ID");

  const call = await prisma.vapiCall.findUnique({
    where: { id },
    select: { id: true, linkedEnquiryId: true, parentName: true, callType: true },
  });
  if (!call) throw ApiError.notFound("Call not found");
  if (call.linkedEnquiryId) throw ApiError.badRequest("Enquiry already exists for this call");
  if (!call.parentName) throw ApiError.badRequest("Cannot create enquiry — no parent name on this call");

  // Temporarily override callType to new_enquiry so createEnquiryFromCall processes it.
  // The helper checks callType === "new_enquiry", so update it first.
  if (call.callType !== "new_enquiry") {
    await prisma.vapiCall.update({
      where: { id },
      data: { callType: "new_enquiry" },
    });
  }

  const enquiryId = await createEnquiryFromCall(id);
  if (!enquiryId) throw ApiError.badRequest("Could not create enquiry — centre may not be resolvable. Add a centre name and try again.");

  return NextResponse.json({ enquiryId }, { status: 201 });
});
