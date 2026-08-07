/**
 * Email audience rules — schema + compiler.
 *
 * An `EmailAudience` stores RULES, never a frozen recipient list. This
 * mirrors the survey-audience precedent (`src/lib/survey-audience.ts`):
 * evaluate at read/send time rather than materialising a membership
 * table, so a contact who resubscribes, changes centre, or opens a
 * later email is picked up automatically without a backfill job. The
 * cost is that "how many people are in this audience" can only ever be
 * answered as of right now — there is no frozen count to disagree with.
 *
 * `compileAudienceWhere` and `resolveAudienceWhere` are the SINGLE
 * source of truth for turning rules into a `CentreContactWhereInput`.
 * They are used identically by the audience CRUD (count/preview), the
 * recipient-count endpoint, and the campaign send route — do not
 * hand-roll an equivalent where clause elsewhere; any future condition
 * type belongs in this file so all three callers stay in lockstep.
 *
 * AND-combination contract: every condition present on the rules object
 * narrows the result — conditions are always ANDed, never ORed. A rules
 * object with `serviceIds` and `statuses` both set returns contacts
 * matching BOTH, not either. `joinedAfter`/`joinedBefore` combine into a
 * single `createdAt` range (both bounds inclusive at their respective
 * ends) rather than two independent filters.
 *
 * `statuses` values ("active" | "withdrawn" | "paused") mirror the
 * free-text convention documented on `CentreContact.status` in the
 * Prisma schema — that column is a plain `String`, NOT a Prisma enum,
 * so this whitelist is enforced here (comment-enforced on the DB side,
 * enum-enforced here) and nowhere else. If `CentreContact.status` ever
 * grows a new free-text value in the wild, this schema will reject it
 * until the whitelist is deliberately extended.
 *
 * Field whitelist: `audienceRulesSchema` is `.strict()` — any key
 * outside the ones declared below (including a raw Prisma where-clause
 * key like `email`) fails validation. The compiler only ever reads the
 * whitelisted, typed fields off `AudienceRules`; it never spreads or
 * interpolates arbitrary rule keys into the where clause. Together
 * these two facts mean a caller can never smuggle an arbitrary
 * `CentreContact` filter through the rules JSON.
 */

import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Whitelisted `CentreContact.status` values — see the file-level doc comment. */
const AUDIENCE_STATUSES = ["active", "withdrawn", "paused"] as const;

/** Engagement condition kinds. `not_opened` inverts the "opened" event set. */
const ENGAGEMENT_KINDS = ["opened", "clicked", "not_opened"] as const;

export const audienceRulesSchema = z
  .object({
    serviceIds: z.array(z.string().min(1)).optional(),
    statuses: z.array(z.enum(AUDIENCE_STATUSES)).optional(),
    /** ISO date string. Combines with joinedBefore into one createdAt range. */
    joinedAfter: z.string().min(1).optional(),
    /** ISO date string. Combines with joinedAfter into one createdAt range. */
    joinedBefore: z.string().min(1).optional(),
    engagement: z
      .object({
        kind: z.enum(ENGAGEMENT_KINDS),
        /** Lookback window in days. 1–365 inclusive. */
        days: z.number().int().min(1).max(365),
      })
      .strict()
      .optional(),
  })
  .strict();

export type AudienceRules = z.infer<typeof audienceRulesSchema>;

/**
 * Pure compiler: rules → `CentreContactWhereInput`, EXCLUDING the
 * `engagement` condition (which requires an async `EmailEvent` lookup —
 * see `resolveAudienceWhere`). The base clause is ALWAYS
 * `{ subscribed: true }`, even for an empty rules object — an audience
 * with zero conditions still means "everyone subscribed", never
 * "everyone including unsubscribed contacts".
 */
export function compileAudienceWhere(
  rules: AudienceRules,
): Prisma.CentreContactWhereInput {
  const where: Prisma.CentreContactWhereInput = { subscribed: true };

  if (rules.serviceIds && rules.serviceIds.length > 0) {
    where.serviceId = { in: rules.serviceIds };
  }

  if (rules.statuses && rules.statuses.length > 0) {
    where.status = { in: rules.statuses };
  }

  if (rules.joinedAfter || rules.joinedBefore) {
    where.createdAt = {
      ...(rules.joinedAfter && { gte: new Date(rules.joinedAfter) }),
      ...(rules.joinedBefore && { lte: new Date(rules.joinedBefore) }),
    };
  }

  return where;
}

/**
 * Full resolver: rules → `CentreContactWhereInput`, INCLUDING the
 * `engagement` condition. When `rules.engagement` is absent this is
 * identical to `compileAudienceWhere` and issues NO `EmailEvent` query
 * — the no-engagement path must stay a pure passthrough so callers that
 * never touch engagement don't pay for a query they don't need.
 *
 * When `engagement` is set, resolves the matching/excluded email set
 * from `EmailEvent` (lowercased, deduped via `distinct: ["email"]`) and
 * ANDs it onto the compiled where as `email: { in }` (`opened`,
 * `clicked`) or `email: { notIn }` (`not_opened` — inverts the
 * "opened" event set: "hasn't opened in N days" is defined relative to
 * who HAS opened, there is no separate "not opened" event type).
 *
 * Takes a narrowed `Pick<PrismaClient, "emailEvent">` rather than the
 * full client so tests can pass an inline `{ emailEvent: { findMany } }`
 * stub instead of standing up the whole mock surface.
 */
export async function resolveAudienceWhere(
  prisma: Pick<PrismaClient, "emailEvent">,
  rules: AudienceRules,
): Promise<Prisma.CentreContactWhereInput> {
  const where = compileAudienceWhere(rules);

  if (!rules.engagement) {
    return where;
  }

  const { kind, days } = rules.engagement;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // "not_opened" is defined by inverting who DID open — there is no
  // distinct "not opened" event type to query directly.
  const queryType = kind === "not_opened" ? "opened" : kind;

  const events = await prisma.emailEvent.findMany({
    where: { type: queryType, createdAt: { gte: since } },
    select: { email: true },
    distinct: ["email"],
  });

  const emails = events.map((event) => event.email.toLowerCase());

  where.email = kind === "not_opened" ? { notIn: emails } : { in: emails };

  return where;
}
