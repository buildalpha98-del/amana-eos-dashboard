/**
 * Per-centre behaviour toggles.
 *
 * Modelled on OWNA's Settings screen, with a hard rule: a toggle only
 * exists here if it actually CHANGES something server-side. Their screen
 * has around eighty; most of ours would be decorative, and a settings
 * page full of switches that do nothing is worse than a short one —
 * people stop believing any of them.
 *
 * Every default is the behaviour centres have today, so writing this
 * field for the first time changes nothing until someone flips a switch.
 */

import { z } from "zod";

export const appSettingsSchema = z.object({
  parents: z
    .object({
      /**
       * Families can mark a child as not attending. On today. Off suits
       * a centre that wants absences phoned through so someone hears
       * why — which matters for a child protection flag.
       */
      canMarkAbsence: z.boolean().optional(),
    })
    .optional(),
  posts: z
    .object({
      /**
       * New posts start as drafts, so someone reviews before families
       * see them. OWNA's equivalent of a Post Approver workflow.
       */
      draftByDefault: z.boolean().optional(),
      /**
       * Only admins and above may publish. Coordinators can still write;
       * their posts wait as drafts. Pointless unless someone actually
       * checks the drafts, so it's off by default.
       */
      onlyApproversPublish: z.boolean().optional(),
    })
    .optional(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

/**
 * The defaults, spelled out. Reading a toggle should never mean
 * remembering which way an absent value falls.
 */
export const APP_SETTINGS_DEFAULTS = {
  parents: { canMarkAbsence: true },
  posts: { draftByDefault: false, onlyApproversPublish: false },
} as const;

/**
 * Two toggles OWNA has that are deliberately NOT here, because they'd
 * change nothing in our system and a settings page full of dead
 * switches teaches people to distrust all of them:
 *
 *  - "Allow commenting on posts" — parent comments are refused
 *    system-wide already (see the parent comments route).
 *  - "Show child's full name" — our feed never names another family's
 *    child at all, so there is no name to shorten.
 *
 * If either of those changes, the toggle earns its place then.
 */

/** Parse whatever is on the Service row into a fully-resolved settings object. */
export function resolveAppSettings(raw: unknown): {
  parents: { canMarkAbsence: boolean };
  posts: { draftByDefault: boolean; onlyApproversPublish: boolean };
} {
  const parsed = appSettingsSchema.safeParse(raw ?? {});
  const v: AppSettings = parsed.success ? parsed.data : {};
  return {
    parents: {
      canMarkAbsence:
        v.parents?.canMarkAbsence ?? APP_SETTINGS_DEFAULTS.parents.canMarkAbsence,
    },
    posts: {
      draftByDefault:
        v.posts?.draftByDefault ?? APP_SETTINGS_DEFAULTS.posts.draftByDefault,
      onlyApproversPublish:
        v.posts?.onlyApproversPublish ??
        APP_SETTINGS_DEFAULTS.posts.onlyApproversPublish,
    },
  };
}

/** Roles that may publish when `onlyApproversPublish` is on. */
const APPROVER_ROLES = new Set(["owner", "head_office", "admin"]);
export function canPublishPosts(role: string, onlyApprovers: boolean): boolean {
  return onlyApprovers ? APPROVER_ROLES.has(role) : true;
}
