import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

// Simple in-memory rate limiter for this public endpoint
const uploadAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_UPLOADS_PER_IP = 20; // 20 uploads per 15 min window
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = uploadAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    uploadAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_UPLOADS_PER_IP) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Rate limit — this endpoint is intentionally public for parent enrolment forms
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  }

  try {
    const { file, filename, contentType } = await req.json();
    if (!file || !filename) {
      return NextResponse.json({ error: "Missing file or filename" }, { status: 400 });
    }

    const buffer = Buffer.from(file, "base64");
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type "${ext}" not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}` },
        { status: 400 }
      );
    }

    const baseName = path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .substring(0, 80);
    const uniqueName = `${baseName}-${Date.now()}${ext}`;

    const { url } = await uploadFile(buffer, uniqueName, {
      contentType: contentType || "application/octet-stream",
      folder: "enrolments",
    });

    return NextResponse.json({ fileUrl: url, fileName: filename, fileSize: buffer.length });
  } catch (e) {
    console.error("Enrolment file upload error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
