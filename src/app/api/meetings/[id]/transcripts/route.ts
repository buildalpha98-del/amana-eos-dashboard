import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertMeetingAccess } from "@/lib/meeting-access";
import { uploadPrivateFile, deletePrivateFile } from "@/lib/private-storage";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { NO_STORE_HEADERS } from "@/lib/recent-auth";

const schema = z.object({ text: z.string().trim().min(1).max(200_000) }).strict();
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  await assertMeetingAccess(session, id);
  const input = schema.safeParse(await parseJsonBody(req));
  if (!input.success) throw ApiError.badRequest("Enter meeting notes, up to 200,000 characters.");
  const file = await uploadPrivateFile(Buffer.from(input.data.text), "meeting-transcript.txt", "text/plain", { meetingId: id, ownerUserId: session.user.id });
  try {
    const record = await prisma.$transaction(async tx => {
      const saved = await tx.meetingRecording.create({ data: { meetingId: id, source: "upload", status: "complete", transcriptFileUrl: file.url, createdById: session.user.id } });
      await tx.activityLog.create({ data: { userId: session.user.id, action: "private_transcript_saved", entityType: "Meeting", entityId: id } });
      return { id: saved.id, fileUrl: file.url };
    });
    return NextResponse.json(record, { status: 201, headers: NO_STORE_HEADERS });
  } catch (err) {
    await deletePrivateFile(file.url).catch(() => {});
    throw err;
  }
}, { roles: [...ADMIN_ROLES, "marketing", "eos_implementer"], rateLimit: { max: 10, windowMs: 60_000 } });
