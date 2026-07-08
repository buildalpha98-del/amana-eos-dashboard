// Upload an encrypted DB backup to Vercel Blob and prune old copies.
// The file is already AES-256 encrypted, so "public" access is safe: the URL
// only yields ciphertext, undecryptable without BACKUP_ENCRYPTION_KEY.
import { readFileSync } from "node:fs";
import { put, list, del } from "@vercel/blob";

const KEEP = 30; // retain the newest 30 daily backups

const file = process.argv[2];
if (!file) {
  console.error("usage: upload-backup.mjs <file>");
  process.exit(1);
}

const { url } = await put(`backups/${file}`, readFileSync(file), {
  access: "public",
  addRandomSuffix: false,
  contentType: "application/octet-stream",
});
console.log("Uploaded:", url);

const { blobs } = await list({ prefix: "backups/" });
const old = blobs
  .sort((a, b) => b.pathname.localeCompare(a.pathname)) // newest first (dated names sort lexically)
  .slice(KEEP);
for (const b of old) {
  await del(b.url);
  console.log("Pruned:", b.pathname);
}
console.log(`Backups retained: ${Math.min(blobs.length, KEEP)}`);
