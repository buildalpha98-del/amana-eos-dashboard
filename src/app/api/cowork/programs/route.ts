import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { programSchema } from "../../_lib/validation";
import { saveBase64File } from "../../_lib/upload";

// POST /api/cowork/programs — Upload a weekly program (upsert)
// Supports both base64 file upload and pre-signed URL references
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    // Support both JSON and multipart/form-data
    let body: Record<string, unknown>;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body = {} as Record<string, unknown>;

      // Extract text fields
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
          body[key] = value;
        }
      }

      // Extract file fields and convert to base64
      const programFileEntry = formData.get("programFile");
      if (programFileEntry instanceof File) {
        const buffer = Buffer.from(await programFileEntry.arrayBuffer());
        body.programFile = {
          filename: programFileEntry.name,
          data: buffer.toString("base64"),
        };
      }

      const resourceFileEntry = formData.get("resourceFile");
      if (resourceFileEntry instanceof File) {
        const buffer = Buffer.from(await resourceFileEntry.arrayBuffer());
        body.resourceFile = {
          filename: resourceFileEntry.name,
          data: buffer.toString("base64"),
        };
      }

      const displayFileEntry = formData.get("displayFile");
      if (displayFileEntry instanceof File) {
        const buffer = Buffer.from(await displayFileEntry.arrayBuffer());
        body.displayFile = {
          filename: displayFileEntry.name,
          data: buffer.toString("base64"),
        };
      }
    } else {
      body = await req.json();
    }

    const parsed = programSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const {
      weekCommencing,
      theme,
      category,
      summary,
      programFile,
      programFileUrl,
      resourceFile,
      resourceFileUrl,
      displayFile,
      displayFileUrl,
    } = parsed.data;

    // Resolve program file URL (base64 upload or pre-signed URL)
    let resolvedProgramUrl: string;
    if (programFile) {
      const upload = await saveBase64File(programFile.data, programFile.filename, "programs");
      resolvedProgramUrl = upload.fileUrl;
    } else {
      resolvedProgramUrl = programFileUrl!;
    }

    // Resolve resource file URL
    let resolvedResourceUrl: string | null = null;
    if (resourceFile) {
      const upload = await saveBase64File(resourceFile.data, resourceFile.filename, "resources");
      resolvedResourceUrl = upload.fileUrl;
    } else if (resourceFileUrl) {
      resolvedResourceUrl = resourceFileUrl;
    }

    // Resolve display file URL
    let resolvedDisplayUrl: string | null = null;
    if (displayFile) {
      const upload = await saveBase64File(displayFile.data, displayFile.filename, "programs");
      resolvedDisplayUrl = upload.fileUrl;
    } else if (displayFileUrl) {
      resolvedDisplayUrl = displayFileUrl;
    }

    // Upsert program (idempotent by weekCommencing)
    const record = await prisma.coworkProgram.upsert({
      where: { weekCommencing },
      create: {
        weekCommencing,
        theme,
        category: category ?? null,
        summary: summary ?? null,
        programFileUrl: resolvedProgramUrl,
        resourceFileUrl: resolvedResourceUrl,
        displayFileUrl: resolvedDisplayUrl,
      },
      update: {
        theme,
        category: category ?? null,
        summary: summary ?? null,
        programFileUrl: resolvedProgramUrl,
        resourceFileUrl: resolvedResourceUrl,
        displayFileUrl: resolvedDisplayUrl,
      },
    });

    // Auto-create announcement
    const attachments = [resolvedProgramUrl];
    if (resolvedResourceUrl) attachments.push(resolvedResourceUrl);

    await prisma.coworkAnnouncement.create({
      data: {
        title: `Weekly Program: ${theme}`,
        body: summary
          ? `This week's program — ${theme}. ${summary}`
          : `The weekly program "${theme}" is now available.`,
        type: "program-update",
        targetCentres: ["all"],
        attachments,
        pinned: false,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[Cowork Programs POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
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
      { status: 500 },
    );
  }
}
