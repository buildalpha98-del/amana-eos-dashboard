import { assertExternalAiAllowed } from "@/lib/ai-privacy";
import { assertMeetingAccess } from "@/lib/meeting-access";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * Meeting recordings (Phase 2, 2026-08-31).
 *
 * POST registers an already-uploaded audio/video blob against a meeting and
 * asks Deepgram to transcribe it (async — the transcript arrives via
 * /api/webhooks/deepgram). The raw audio is deleted after transcription;
 * the transcript is the durable record.
 */

const MEETING_ROLES = [...ADMIN_ROLES, "marketing", "eos_implementer"] as const;

// POST /api/meetings/[id]/recordings
export const POST = withApiAuth(async () => {
  // Check before creating rows or deleting any submitted URL.
  assertExternalAiAllowed();
  return NextResponse.json({ error: "External AI processing is blocked." }, { status: 403 });
}, { roles: [...MEETING_ROLES] });

// GET /api/meetings/[id]/recordings — list (transcript Json excluded; the
// flat transcriptText + aiReview are what the UI renders)
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
    await assertMeetingAccess(session, id);

  const recordings = await prisma.meetingRecording.findMany({
    where: { meetingId: id },
    select: {
      id: true,
      meetingId: true,
      source: true,
      status: true,
      durationSeconds: true,
      transcriptText: true,
      transcriptFileUrl: true,
      aiReview: true,
      error: true,
      createdById: true,
      createdBy: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(recordings, { headers: { "Cache-Control": "private, no-store" } });
});
