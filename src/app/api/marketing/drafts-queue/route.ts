import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

interface DraftItem {
  id: string;
  itemType: "post" | "task" | "touchpoint" | "school_comm";
  title: string;
  serviceId: string | null;
  serviceName: string | null;
  dueDate: string | null;
  priority: string | null;
  sourceModel: string;
  channel?: string;
  platform?: string;
}

/**
 * GET /api/marketing/drafts-queue — Unified queue of all pending/draft items
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  try {
    const [draftPosts, pendingTasks, draftTouchpoints, draftSchoolComms] = await Promise.all([
      // Draft posts
      prisma.marketingPost.findMany({
        where: {
          status: "draft",
          ...(serviceId
            ? { services: { some: { serviceId } } }
            : {}),
        },
        select: {
          id: true,
          title: true,
          platform: true,
          scheduledDate: true,
          services: {
            select: { service: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      }),

      // Pending/in-progress tasks
      prisma.marketingTask.findMany({
        where: {
          status: { in: ["todo", "in_progress"] },
          deleted: false,
          ...(serviceId ? { serviceId } : {}),
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      }),

      // Draft/pending_review touchpoints
      prisma.parentEnquiryTouchpoint.findMany({
        where: {
          status: { in: ["draft", "pending_review"] },
          ...(serviceId
            ? { enquiry: { serviceId } }
            : {}),
        },
        select: {
          id: true,
          type: true,
          channel: true,
          content: true,
          enquiry: {
            select: {
              parentName: true,
              serviceId: true,
              service: { select: { id: true, name: true } },
            },
          },
        },
      }),

      // Draft school comms
      prisma.schoolComm.findMany({
        where: {
          status: "draft",
          ...(serviceId ? { serviceId } : {}),
        },
        select: {
          id: true,
          subject: true,
          schoolName: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      }),
    ]);

    const items: DraftItem[] = [];

    // Posts
    for (const p of draftPosts) {
      const svc = p.services[0]?.service ?? null;
      items.push({
        id: p.id,
        itemType: "post",
        title: p.title,
        serviceId: svc?.id ?? null,
        serviceName: svc?.name ?? null,
        dueDate: p.scheduledDate?.toISOString() ?? null,
        priority: null,
        sourceModel: "MarketingPost",
        platform: p.platform,
      });
    }

    // Tasks
    for (const t of pendingTasks) {
      items.push({
        id: t.id,
        itemType: "task",
        title: t.title,
        serviceId: t.serviceId,
        serviceName: t.service?.name ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        priority: t.priority,
        sourceModel: "MarketingTask",
      });
    }

    // Touchpoints
    for (const tp of draftTouchpoints) {
      const summary = tp.enquiry
        ? `${tp.type.replace(/_/g, " ")} for ${tp.enquiry.parentName}`
        : tp.type.replace(/_/g, " ");
      items.push({
        id: tp.id,
        itemType: "touchpoint",
        title: summary,
        serviceId: tp.enquiry?.serviceId ?? null,
        serviceName: tp.enquiry?.service?.name ?? null,
        dueDate: null,
        priority: null,
        sourceModel: "ParentEnquiryTouchpoint",
        channel: tp.channel,
      });
    }

    // School Comms
    for (const sc of draftSchoolComms) {
      items.push({
        id: sc.id,
        itemType: "school_comm",
        title: sc.subject,
        serviceId: sc.serviceId,
        serviceName: sc.service?.name ?? null,
        dueDate: null,
        priority: null,
        sourceModel: "SchoolComm",
      });
    }

    // Sort: overdue first, then by due date ascending
    const now = new Date();
    items.sort((a, b) => {
      const aDate = a.dueDate ? new Date(a.dueDate) : null;
      const bDate = b.dueDate ? new Date(b.dueDate) : null;
      const aOverdue = aDate && aDate < now ? 1 : 0;
      const bOverdue = bDate && bDate < now ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue; // overdue first
      if (aDate && bDate) return aDate.getTime() - bDate.getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return 0;
    });

    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    console.error("[Drafts Queue GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
