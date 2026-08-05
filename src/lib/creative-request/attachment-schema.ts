import { z } from "zod";
import { safeAttachmentUrl } from "@/lib/schemas/message-attachments";

/** Attachment payload accepted by create + message routes. URLs must be
 *  our own Vercel Blob storage — see safeAttachmentUrl. */
export const attachmentInputSchema = z.object({
  fileName: z.string().min(1).max(300),
  fileUrl: safeAttachmentUrl,
  fileSize: z.number().int().min(0).optional(),
  mimeType: z.string().max(200).optional(),
});
