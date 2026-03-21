import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const patchEnrolmentSchema = z.object({
  status: z.enum(["submitted", "under_review", "processed", "rejected", "archived"], {
    error: "Invalid status. Must be one of: submitted, under_review, processed, rejected, archived",
  }).optional(),
  notes: z.string().max(5000, "Notes must be under 5000 characters").optional().nullable(),
  pdfUrl: z.string().url("pdfUrl must be a valid URL").optional().nullable(),
}).strict();

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

  return NextResponse.json(submission);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();

  const parsed = patchEnrolmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status === "processed" && session) {
    updateData.processedById = session.user.id;
    updateData.processedAt = new Date();
  }

  const updated = await prisma.enrolmentSubmission.update({
    where: { id },
    data: updateData,
  });

  // When confirmed (processed), activate all Child records
  if (parsed.data.status === "processed") {
    await prisma.child.updateMany({
      where: { enrolmentId: id, status: "pending" },
      data: { status: "active" },
    });
  }

  return NextResponse.json(updated);
}
