import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * Convert a .docx buffer to plain text.
 * Tries pandoc CLI first, falls back to mammoth npm.
 */
export async function docxToText(buffer: Buffer): Promise<string> {
  try {
    return await pandocConvert(buffer);
  } catch {
    return await mammothConvert(buffer);
  }
}

/* ------------------------------------------------------------------ */
/* pandoc CLI                                                          */
/* ------------------------------------------------------------------ */

function pandocConvert(buffer: Buffer): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const tmpPath = join(tmpdir(), `audit-${randomUUID()}.docx`);
    try {
      await writeFile(tmpPath, buffer);
      execFile(
        "pandoc",
        ["--to=plain", "--wrap=none", tmpPath],
        { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
        async (err, stdout, stderr) => {
          await cleanup(tmpPath);
          if (err) return reject(err);
          resolve(stdout);
        }
      );
    } catch (e) {
      await cleanup(tmpPath);
      reject(e);
    }
  });
}

/* ------------------------------------------------------------------ */
/* mammoth fallback                                                    */
/* ------------------------------------------------------------------ */

async function mammothConvert(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/* ------------------------------------------------------------------ */
/* mammoth HTML (preserves tables)                                     */
/* ------------------------------------------------------------------ */

/**
 * Convert a .docx buffer to HTML using mammoth.
 * Preserves table structure for downstream DOM parsing.
 */
export async function docxToHtml(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}

/* ------------------------------------------------------------------ */

async function cleanup(path: string) {
  try {
    await unlink(path);
  } catch {
    // ignore
  }
}
