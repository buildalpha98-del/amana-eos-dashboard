import { z } from "zod";
import { MERGE_TAGS_BY_KEY } from "./merge-tag-catalog";

export const manualFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key must be a valid identifier"),
  label: z.string().min(1),
  type: z.enum(["text", "longtext", "date", "number"]),
  required: z.boolean(),
  default: z.string().optional(),
});

export const manualFieldsSchema = z.array(manualFieldSchema).superRefine((fields, ctx) => {
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) ctx.addIssue({ code: "custom", message: `Duplicate key: ${f.key}` });
    seen.add(f.key);
    if (MERGE_TAGS_BY_KEY[f.key]) ctx.addIssue({ code: "custom", message: `Key "${f.key}" collides with a built-in merge tag` });
  }
});

export type ManualField = z.infer<typeof manualFieldSchema>;
