import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getParentSession } from "@/lib/parent-auth";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { assertPrivateFileAccess } from "@/lib/private-file-access";
import { privateFileUrl } from "@/lib/private-storage";
import { streamStoredFile } from "@/lib/blob-proxy";
import { checkRateLimit } from "@/lib/rate-limit";

export const GET = withApiHandler(async (req, context) => {
  // Both independently validated session types can use the same saved URL.
  const staff = await getServerSession(authOptions);
  const parent = staff ? null : await getParentSession(req);
  if (!staff && !parent) throw ApiError.unauthorized();
  const limit = await checkRateLimit(`private-file:${staff?.user.id ?? parent?.accountId ?? parent?.email}`, 60, 60_000);
  if (limit.limited) throw new ApiError(429, "Please wait a moment before opening another file.");
  const { id } = await context!.params!;
  const file = await prisma.privateFile.findUnique({ where: { id } });
  if (!file) throw ApiError.notFound("File not found");
  await assertPrivateFileAccess(file, staff, parent);
  await prisma.privateFileAccess.create({ data: { fileId: id, userId: staff?.user.id, parentAccountId: parent?.accountId } });
  return streamStoredFile(privateFileUrl(id), { fileName: file.fileName });
});
