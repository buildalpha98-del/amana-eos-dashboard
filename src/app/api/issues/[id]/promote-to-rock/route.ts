import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { getCurrentQuarter } from "@/lib/utils";

const promoteSchema = z.object({
  quarter: z.string().min(1).optional(),
  ownerId: z.string().nullable().optional(),
  rockType: z.enum(["company", "personal"]).optional(),
});

// POST /api/issues/[id]/promote-to-rock
// EOS quarterly move: turn a long-term issue into a Rock. Closes the issue
// off its list and links it to the new rock (traceable via Issue.rockId).
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = promoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const issue = await prisma.issue.findUnique({ where: { id, deleted: false } });
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
    if (issue.rockId) {
      return NextResponse.json(
        { error: "Issue has already been promoted to a Rock" },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Race guard — only the first concurrent promote wins. A second one
      // finds rockId already null-no-more (count 0) and bails to a 409.
      const guard = await tx.issue.updateMany({
        where: { id, rockId: null, deleted: false },
        data: { status: "closed" },
      });
      if (guard.count === 0) return null;

      const rock = await tx.rock.create({
        data: {
          title: issue.title,
          description: issue.description,
          ownerId: parsed.data.ownerId ?? issue.ownerId ?? null,
          quarter: parsed.data.quarter || getCurrentQuarter(),
          rockType: parsed.data.rockType ?? "company",
          serviceId: issue.serviceId,
        },
        include: {
          owner: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });

      const updatedIssue = await tx.issue.update({
        where: { id },
        data: { rockId: rock.id },
        include: {
          rock: { select: { id: true, title: true } },
          owner: { select: { id: true, name: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "promote_to_rock",
          entityType: "Issue",
          entityId: id,
          details: { rockId: rock.id, quarter: rock.quarter },
        },
      });

      return { rock, issue: updatedIssue };
    });

    if (!result) {
      return NextResponse.json(
        { error: "Issue has already been promoted to a Rock" },
        { status: 409 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "marketing", "eos_implementer"] }
);
