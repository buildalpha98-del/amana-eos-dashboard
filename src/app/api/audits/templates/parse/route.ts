import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { parseAuditDocumentHybrid } from "@/lib/audit-parser";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

/**
 * POST /api/audits/templates/parse — upload & parse a .docx file
 * Returns parsed preview (no DB writes).
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type) && !file.name.endsWith(".docx") && !file.name.endsWith(".doc")) {
    return NextResponse.json(
      { error: "Only .docx and .doc files are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 10 MB limit" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseAuditDocumentHybrid(buffer);

    return NextResponse.json({
      filename: file.name,
      ...parsed,
    });
  } catch (err) {
    console.error("Parse error:", err);
    return NextResponse.json(
      { error: "Failed to parse document. Ensure it is a valid .docx file." },
      { status: 422 }
    );
  }
}
