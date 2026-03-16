import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["owner", "head_office"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent: check if a welcome banner already exists
  const existing = await prisma.systemBanner.findFirst({
    where: { title: { contains: "Welcome" } },
  });

  if (existing) {
    return NextResponse.json(existing);
  }

  const banner = await prisma.systemBanner.create({
    data: {
      title: "Welcome to the Amana EOS Dashboard! \uD83C\uDF89",
      body: "Your new hub for managing rocks, to-dos, scorecards, compliance, and more. Head to Getting Started to learn the ropes.",
      type: "feature",
      linkUrl: "/getting-started",
      linkLabel: "Get Started",
      active: true,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(banner, { status: 201 });
}
