/**
 * Audience recipient counting + stored-rules parsing.
 *
 * Server-side companion to `src/lib/audience-rules.ts` (which stays pure /
 * prisma-free so its unit tests don't drag the real Prisma client in).
 * These helpers are shared by the audience detail GET, the draft-rules
 * preview-count route, and the recipient-count route so "how big is this
 * audience" is computed exactly one way: resolve rules through the shared
 * compiler, dedupe by lowercased email, subtract suppressions — mirroring
 * what campaign/send will actually dispatch.
 */

import { prisma } from "@/lib/prisma";
import { getSuppressedEmails } from "@/lib/email-suppression";
import {
  audienceRulesSchema,
  resolveAudienceWhere,
  type AudienceRules,
} from "@/lib/audience-rules";
import { ApiError } from "@/lib/api-error";

/**
 * Parse rules JSON loaded from an `EmailAudience` row. Rules are validated
 * on every write path, so a parse failure here means data drift (manual DB
 * edit, schema tightened after rows were written). Fail LOUDLY with a 400
 * rather than silently falling back to `{}` — an empty-rules fallback would
 * quietly widen the audience to every subscribed contact.
 */
export function parseStoredAudienceRules(rules: unknown): AudienceRules {
  const parsed = audienceRulesSchema.safeParse(rules);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Audience rules are invalid — edit and re-save the audience",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

/**
 * Live post-suppression recipient count for a rules object. Matches the
 * send path: unique lowercased emails minus suppressed addresses
 * (`getSuppressedEmails` returns a LOWERCASED set — compare lowercase to
 * lowercase or the filter silently matches nothing).
 */
export async function countAudienceRecipients(
  rules: AudienceRules,
): Promise<number> {
  const where = await resolveAudienceWhere(prisma, rules);

  const contacts = await prisma.centreContact.findMany({
    where,
    select: { email: true },
  });

  const uniqueEmails = new Set(contacts.map((c) => c.email.toLowerCase()));

  const suppressed = await getSuppressedEmails([...uniqueEmails]);
  return [...uniqueEmails].filter((email) => !suppressed.has(email)).length;
}
