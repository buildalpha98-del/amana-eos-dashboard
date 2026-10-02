import { deleteFile } from "@/lib/storage";
import { createManualSource, type ManualSourceInput } from "@/lib/knowledge/adapters/manual";
import { logger } from "@/lib/logger";
import type { UpsertResult } from "@/lib/knowledge/types";

/**
 * `createManualSource`, but a blob that never became a `KnowledgeSource`
 * row is an orphan in Vercel Blob storage — the credential guard's throw
 * (`ApiError.badRequest`) is the common case, but ANY throw (extraction
 * failure, DB error) leaves the same orphan, since the row that would have
 * pointed at the blob was never written. Deletes `blobUrl` best-effort
 * (swallow-and-log a deletion failure — losing the ORIGINAL rejection
 * reason to a cleanup failure would hide why the upload was rejected), then
 * rethrows the original error unchanged so callers see the same failure
 * shape as `createManualSource` itself.
 *
 * Shared by the register route (client-driven) and the upload webhook's
 * single-file path (`onUploadCompleted`) — both know a single blob URL for
 * the row they're trying to create. The per-zip-entry path has its own
 * cleanup: the blob there is the whole archive, not one entry, so deletion
 * happens once after every entry has been processed.
 */
export async function createManualSourceOrCleanBlob(
  input: ManualSourceInput,
  blobUrl: string,
): Promise<UpsertResult> {
  try {
    return await createManualSource(input);
  } catch (err) {
    try {
      await deleteFile(blobUrl);
    } catch (delErr) {
      logger.warn("AI knowledge: blob cleanup failed after rejected upload", {
        blobUrl,
        err: delErr instanceof Error ? delErr.message : String(delErr),
      });
    }
    throw err;
  }
}
