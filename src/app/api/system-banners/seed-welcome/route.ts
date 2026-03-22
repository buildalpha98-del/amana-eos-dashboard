import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";

const SEED_BANNERS = [
  {
    title: "Welcome to the Amana OSHC Dashboard! \uD83C\uDF89",
    body: "Complete your Getting Started checklist to get set up.",
    type: "celebration",
    linkUrl: "/getting-started",
    linkLabel: "Get Started",
    matchTitle: "Welcome",
  },
  {
    title: "New here? \uD83D\uDCD6",
    body: "Check out your role's Quick-Start Guide for a walkthrough.",
    type: "info",
    linkUrl: "/guides",
    linkLabel: "View Guides",
    matchTitle: "Quick-Start Guide",
  },
];

export const POST = withApiAuth(async (req, session) => {
  const role = (session.user as Record<string, unknown>).role as string;
  if (!["owner", "head_office"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { title: string; status: string }[] = [];

  for (const seed of SEED_BANNERS) {
    const existing = await prisma.systemBanner.findFirst({
      where: { title: { contains: seed.matchTitle } },
    });

    if (existing) {
      results.push({ title: seed.title, status: "already_exists" });
      continue;
    }

    await prisma.systemBanner.create({
      data: {
        title: seed.title,
        body: seed.body,
        type: seed.type,
        linkUrl: seed.linkUrl,
        linkLabel: seed.linkLabel,
        active: true,
        dismissible: true,
        createdById: session.user.id,
      },
    });

    results.push({ title: seed.title, status: "created" });
  }

  return NextResponse.json({ results }, { status: 201 });
});
