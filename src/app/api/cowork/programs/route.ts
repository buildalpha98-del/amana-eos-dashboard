import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { programSchema } from "../../_lib/validation";
import { saveBase64File } from "../../_lib/upload";

// POST /api/cowork/programs — Upload a weekly program (upsert)
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = programSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { weekCommencing, theme, category, summary, programFile, resourceFile, displayFile } =
      parsed.data;

    // Save files
    const program = await saveBase64File(programFile.data, programFile.filename, "programs");
    let resource: Awaited<ReturnType<typeof saveBase64File>> | null = null;
    let display: Awaited<ReturnType<typeof saveBase64File>> | null = null;

    if (resourceFile) {
      resource = await saveBase64File(resourceFile.data, resourceFile.filename, "resources");
    }
    if (displayFile) {
      display = await saveBase64File(displayFile.data, displayFile.filename, "programs");
    }

    // Upsert program (idempotent by weekCommencing)
    const record = await prisma.coworkProgram.upsert({
      where: { weekCommencing },
      create: {
        weekCommencing,
        theme,
        category: category ?? null,
        summary: summary ?? null,
        programFileUrl: program.fileUrl,
        resourceFileUrl: resource?.fileUrl ?? null,
        displayFileUrl: display?.fileUrl ?? null,
      },
      update: {
        theme,
        category: category ?? null,
        summary: summary ?? null,
        programFileUrl: program.fileUrl,
        resourceFileUrl: resource?.fileUrl ?? null,
        displayFileUrl: display?.fileUrl ?? null,
      },
    });

    // Auto-create announcement
    await prisma.coworkAnnouncement.create({
      data: {
        title: `Weekly Program: ${theme}`,
        body: summary
          ? `This week's program — ${theme}. ${summary}`
          : `The weekly program "${theme}" is now available.`,
        type: "program-update",
        targetCentres: ["all"],
        attachments: [program.fileUrl, ...(resource ? [resource.fileUrl] : [])],
        pinned: false,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[Cowork Programs POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/cowork/programs — Retrieve programs
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const week = searchParams.get("week");

    if (week) {
      const weekDate = new Date(week);
      if (isNaN(weekDate.getTime())) {
        return NextResponse.json({ error: "Invalid week date" }, { status: 400 });
      }
      const program = await prisma.coworkProgram.findUnique({
        where: { weekCommencing: weekDate },
      });
      return NextResponse.json(program ?? null);
    }

    const programs = await prisma.coworkProgram.findMany({
      orderBy: { weekCommencing: "desc" },
      take: 10,
    });
    return NextResponse.json(programs);
  } catch (err) {
    console.error("[Cowork Programs GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
