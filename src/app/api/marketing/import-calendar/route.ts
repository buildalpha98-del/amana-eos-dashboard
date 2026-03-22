import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import {
  validateFile,
  parseCalendarFile,
  buildPreviewResult,
  importCalendarPosts,
} from "@/lib/marketing-calendar-import";

export const POST = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const isPreview = searchParams.get("preview") === "true";

  // ── Parse the uploaded file ───────────────────────────────
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const validationError = validateFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  let parseResult;
  try {
    parseResult = await parseCalendarFile(file);
  } catch (err) {
    const message =
      err instanceof Error && err.message === "File contains no data rows."
        ? err.message
        : "Failed to parse file. Ensure it is a valid CSV or Excel file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ── Preview mode ──────────────────────────────────────────
  if (isPreview) {
    return NextResponse.json(buildPreviewResult(parseResult));
  }

  // ── Import mode ───────────────────────────────────────────
  if (parseResult.posts.length === 0) {
    return NextResponse.json(
      { error: "No valid posts to import.", errors: parseResult.errors },
      { status: 400 },
    );
  }

  try {
    const result = await importCalendarPosts(
      parseResult,
      session!.user.id,
      file.name,
    );

    return NextResponse.json({
      success: true,
      summary: {
        postsCreated: result.postsCreated,
        campaignsCreated: result.campaignsCreated,
        campaignsMatched: result.campaignsMatched,
        errors: result.errors.length,
      },
      posts: result.posts,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, { roles: ["owner", "head_office", "admin", "marketing"] });
