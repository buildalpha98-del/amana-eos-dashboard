import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAuditDocumentHybrid } from "@/lib/audit-parser";
import { matchTemplates } from "@/lib/audit-matcher";
import { withApiAuth } from "@/lib/server-auth";
import { validateFileContent } from "@/lib/file-validation";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file

/**
 * POST /api/audits/templates/bulk-parse — parse multiple .docx files
 * and match each to existing templates.
 */
export const POST = withApiAuth(async (req, session) => {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one file is required" }, { status: 400 });
  }

  // Fetch all templates for matching
  const templates = await prisma.auditTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const filenames = files.map((f) => f.name);
  const matches = matchTemplates(filenames, templates);

  const results = await Promise.all(
    files.map(async (file, idx) => {
      if (file.size > MAX_SIZE) {
        return {
          filename: file.name,
          error: "File exceeds 10 MB limit",
          parsed: null,
          match: matches[idx],
        };
      }

      // Validate file content matches declared MIME type
      const arrayBuf = await file.arrayBuffer();
      if (!validateFileContent(arrayBuf, file.type)) {
        return {
          filename: file.name,
          error: "File content does not match declared type",
          parsed: null,
          match: matches[idx],
        };
      }

      try {
        const buffer = Buffer.from(arrayBuf);
        const parsed = await parseAuditDocumentHybrid(buffer);

        return {
          filename: file.name,
          error: null,
          parsed,
          match: matches[idx],
        };
      } catch (err) {
        return {
          filename: file.name,
          error: "Failed to parse document",
          parsed: null,
          match: matches[idx],
        };
      }
    })
  );

  return NextResponse.json({ results });
}, { roles: ["owner", "head_office", "admin"] });
