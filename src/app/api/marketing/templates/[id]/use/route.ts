import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// POST /api/marketing/templates/:id/use — create a post pre-filled from a template
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const template = await prisma.marketingTemplate.findUnique({
    where: { id },
  });

  if (!template || template.deleted) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  const post = await prisma.marketingPost.create({
    data: {
      title: template.name,
      platform: template.platform,
      content: template.content,
      pillar: template.pillar,
      notes: template.notes,
      status: "draft",
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      campaign: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "use_template",
      entityType: "MarketingPost",
      entityId: post.id,
      details: { templateId: template.id, templateName: template.name },
    },
  });

  return NextResponse.json(post, { status: 201 });
}
