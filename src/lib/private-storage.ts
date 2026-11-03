import { privateFileId } from "@/lib/private-file-reference";
export { privateFileId } from "@/lib/private-file-reference";
import { randomUUID } from "node:crypto";
import { put, del, get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export function privateStorageOptions() {
  // No fallback to the public store or its token, even during a misconfiguration.
  const storeId = process.env.PRIVATE_BLOB_STORE_ID;
  const token = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!storeId && !token) throw new ApiError(503, "Private storage isn't connected yet. Your file wasn't uploaded.");
  if (token) return { token };
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (!oidcToken) throw new ApiError(503, "Private storage authentication isn't available. Your file wasn't uploaded.");
  return { storeId: storeId!, oidcToken };
}
export function privateFileUrl(id: string) {
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  return `${origin}/api/private-files/${id}`;
}
export async function uploadPrivateFile(file: Buffer | File, fileName: string, contentType: string, scope: {
  ownerUserId?: string; ownerParentId?: string; childId?: string; meetingId?: string;
}) {
  if (!scope.ownerUserId && !scope.ownerParentId && !scope.childId && !scope.meetingId) throw new Error("Private files require an access scope");
  // Storage object names contain no names of children or families.
  const blob = await put(`protected/${randomUUID()}`, file, { ...privateStorageOptions(), access: "private", contentType, addRandomSuffix: true });
  try {
    const record = await prisma.privateFile.create({ data: { blobUrl: blob.url, fileName, contentType, ...scope } });
    return { url: privateFileUrl(record.id), size: "byteLength" in file ? file.byteLength : file.size };
  } catch (err) {
    await del(blob.url, privateStorageOptions()).catch(() => {});
    throw err;
  }
}
/** Only call after authorising the parent record, never with an arbitrary client URL. */
export async function privateFileResponse(url: string) {
  const id = privateFileId(url);
  const file = id && await prisma.privateFile.findUnique({ where: { id } });
  if (!file) throw ApiError.notFound("File not found");
  const blob = await get(file.blobUrl, { ...privateStorageOptions(), access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) throw ApiError.notFound("File not found");
  return new Response(blob.stream, { headers: { "content-type": file.contentType } });
}
export async function deletePrivateFile(url: string) {
  const id = privateFileId(url);
  if (!id) return false;
  const file = await prisma.privateFile.findUnique({ where: { id } });
  if (file) {
    await del(file.blobUrl, privateStorageOptions());
    await prisma.privateFile.delete({ where: { id } });
  }
  return true;
}
