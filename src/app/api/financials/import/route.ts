import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { parseFinancialsSpreadsheet } from "@/lib/financials-import";

export const POST = withApiAuth(async (req, session) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const periodType = (formData.get("periodType") as string) || "monthly";
  const dryRun = formData.get("dryRun") === "true";

  if (!file) {
    throw ApiError.badRequest("No file provided");
  }

  const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_IMPORT_SIZE) {
    throw ApiError.badRequest("File exceeds 10MB limit");
  }

  // Validate file type
  const validTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
  ];
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!validTypes.includes(file.type) && !["xlsx", "xls", "csv"].includes(ext || "")) {
    throw ApiError.badRequest("Invalid file type. Please upload .xlsx, .xls, or .csv files.");
  }

  const buffer = await file.arrayBuffer();

  try {
    const result = await parseFinancialsSpreadsheet(
      buffer,
      file.name,
      periodType,
      dryRun,
      session.user.id as string,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}, { roles: ["owner", "head_office", "admin"] });
