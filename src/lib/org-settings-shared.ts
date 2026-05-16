/**
 * Shared org-settings types, defaults and Zod validators that are safe
 * to import from client components.
 *
 * The server-only counterpart (`@/lib/org-settings`) re-exports everything
 * here and adds the Prisma-backed reader/writer + in-process cache.
 * Splitting them avoids pulling Prisma into the client bundle, which
 * blows up at runtime ("PrismaClient is unable to run in this browser
 * environment").
 *
 * 2026-05-16.
 */

import { z } from "zod";

// 2026-05-16: This file is imported transitively by src/middleware.ts (via
// src/lib/role-permissions.ts → ROLE_DISPLAY_NAMES = ROLE_LABEL_DEFAULTS).
// Middleware runs in the Edge runtime, where ANY transitive reference to
// "@prisma/client" — even an `import type` — can drag the Prisma binary
// into the Edge bundle and produce "PrismaClient is unable to run in this
// browser environment, running in `unknown`" at request time.
//
// Inlining the Role union here removes the @prisma/client dependency
// entirely. The literal union has to be kept in sync with the `Role` enum
// in prisma/schema.prisma — they're checked structurally everywhere else
// the union is used, so a drift would surface as a type error in the next
// build.
type Role =
  | "owner"
  | "head_office"
  | "admin"
  | "marketing"
  | "member"
  | "staff";

// ─── Schema ─────────────────────────────────────────────────────────────────

const ratioStringSchema = z
  .string()
  .regex(/^\d+:\d+$/i, "Use the form '1:15' (educator : children)");

const pillarWeightsSchema = z
  .object({
    financial: z.number().min(0).max(1),
    operational: z.number().min(0).max(1),
    compliance: z.number().min(0).max(1),
    satisfaction: z.number().min(0).max(1),
    teamCulture: z.number().min(0).max(1),
  })
  .refine(
    (w) => {
      const sum =
        w.financial +
        w.operational +
        w.compliance +
        w.satisfaction +
        w.teamCulture;
      return Math.abs(sum - 1) < 0.001;
    },
    { message: "Pillar weights must sum to 1.0" },
  );

const thresholdsSchema = z
  .object({
    green: z.number().min(0).max(100),
    amber: z.number().min(0).max(100),
  })
  .refine((t) => t.green > t.amber, {
    message: "Green threshold must be greater than amber",
  });

const roleLabelsSchema = z.object({
  owner: z.string().min(1).max(60),
  head_office: z.string().min(1).max(60),
  admin: z.string().min(1).max(60),
  marketing: z.string().min(1).max(60),
  member: z.string().min(1).max(60),
  staff: z.string().min(1).max(60),
});

// 2026-05-16: per-role guide overrides — welcome message only for v1.
// The deep structured sections / steps editor is a follow-up. This handles
// the highest-frequency edit (stale hardcoded names in welcome copy, e.g.
// "Welcome from Jayden & Daniel") without needing a tree editor.
const roleGuidesSchema = z.object({
  owner: z.object({ welcomeMessage: z.string().max(2_000) }),
  head_office: z.object({ welcomeMessage: z.string().max(2_000) }),
  admin: z.object({ welcomeMessage: z.string().max(2_000) }),
  marketing: z.object({ welcomeMessage: z.string().max(2_000) }),
  member: z.object({ welcomeMessage: z.string().max(2_000) }),
  staff: z.object({ welcomeMessage: z.string().max(2_000) }),
});

// 2026-05-16: per-item override map for the Getting Started checklist.
// Keyed by ChecklistItem.key (e.g. "staff_profile"). Each entry may
// override `title` and/or `description`. `href`, `icon`, `category` stay
// code-driven — admin shouldn't be able to point an item at a non-existent
// route. Empty / missing keys fall back to the hardcoded CHECKLISTS map.
const checklistOverrideEntrySchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(800).optional(),
});

const checklistOverridesSchema = z.object({
  owner: z.record(z.string(), checklistOverrideEntrySchema),
  head_office: z.record(z.string(), checklistOverrideEntrySchema),
  admin: z.record(z.string(), checklistOverrideEntrySchema),
  marketing: z.record(z.string(), checklistOverrideEntrySchema),
  member: z.record(z.string(), checklistOverrideEntrySchema),
  staff: z.record(z.string(), checklistOverrideEntrySchema),
});

// 2026-05-16: onboarding welcome announcement seed override. The original
// hardcoded copy referenced specific exec names ("Reach out to Jayden or
// Daniel anytime") — needed a code push every time the team changed.
const onboardingWelcomeSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});

// 2026-05-16: parent-facing welcome pack PDF. Programmes + narrative
// blocks used to be hardcoded in src/lib/welcome-pack-pdf.ts. Per the
// audit they update frequently (pricing pitches, programme descriptions
// drift over the year). Templates support {{parentName}}, {{childName}},
// {{centreName}} placeholders rendered at PDF-generation time.
const welcomePackProgrammeSchema = z.object({
  name: z.string().min(1).max(120),
  desc: z.string().min(1).max(500),
});
const welcomePackSchema = z.object({
  welcomeIntro: z.string().min(1).max(4_000),
  ratesIntro: z.string().min(1).max(2_000),
  enrolSteps: z.string().min(1).max(4_000),
  contactPhone: z.string().max(60),
  contactEmail: z.string().max(120),
  contactWebsite: z.string().max(120),
  footerLine: z.string().max(240),
  programmes: z.array(welcomePackProgrammeSchema).min(1).max(20),
});

export const orgSettingsConfigSchema = z.object({
  email: z.object({
    senderEmail: z.string().email(),
    senderName: z.string().min(1).max(100),
  }),
  ratios: z.object({
    federalDefaultMinRatio: ratioStringSchema,
  }),
  healthScore: z.object({
    pillarWeights: pillarWeightsSchema,
    thresholds: thresholdsSchema,
  }),
  // 2026-05-16: user-facing role display names. Renamed twice in recent
  // history (coordinator collapse, member → OSHC Educator) — each rename
  // previously needed a code push. Now editable in /settings/organisation.
  // The DB rows still reference the Prisma `Role` enum (owner, head_office,
  // admin, marketing, member, staff); the label is purely cosmetic.
  roleLabels: roleLabelsSchema,
  // 2026-05-16: per-role guide overrides (welcome message only for v1).
  roleGuides: roleGuidesSchema,
  // 2026-05-16: per-item Getting Started checklist overrides (title +
  // description per item key, per role).
  checklistOverrides: checklistOverridesSchema,
  // 2026-05-16: announcement seeded on user creation — defaults match the
  // current hardcoded copy in src/lib/onboarding-seed.ts.
  onboardingWelcome: onboardingWelcomeSchema,
  // 2026-05-16: parent-facing Welcome Pack PDF.
  welcomePack: welcomePackSchema,
});

export type OrgSettingsConfig = z.infer<typeof orgSettingsConfigSchema>;

export type RoleLabels = OrgSettingsConfig["roleLabels"];

/** Static fallback used by `useRoleLabel()` when no provider is mounted. */
export const ROLE_LABEL_DEFAULTS: RoleLabels = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  member: "OSHC Educator",
  staff: "Educator",
};

/** Server-safe label getter. Pass the merged `OrgSettingsConfig.roleLabels`. */
export function getRoleLabel(role: Role, labels: RoleLabels = ROLE_LABEL_DEFAULTS): string {
  return labels[role] ?? ROLE_LABEL_DEFAULTS[role] ?? role;
}

// ─── Code defaults ──────────────────────────────────────────────────────────
// These mirror the constants that used to be hardcoded in brevo.ts,
// ratio-compute.ts, and health-score.ts. They're the fallback when no DB
// row (or an incomplete one) exists. Reading `process.env.BREVO_*` is safe
// at module evaluation time on both server and client (the values are
// inlined as empty strings on the client by Next.js).

export const ORG_SETTINGS_DEFAULTS: OrgSettingsConfig = {
  email: {
    senderEmail: process.env.BREVO_SENDER_EMAIL || "admin@amanaoshc.com.au",
    senderName: process.env.BREVO_SENDER_NAME || "Amana OSHC",
  },
  ratios: {
    federalDefaultMinRatio: "1:15",
  },
  healthScore: {
    pillarWeights: {
      financial: 0.3,
      operational: 0.25,
      compliance: 0.2,
      satisfaction: 0.15,
      teamCulture: 0.1,
    },
    thresholds: {
      green: 75,
      amber: 50,
    },
  },
  roleLabels: ROLE_LABEL_DEFAULTS,
  roleGuides: {
    owner: { welcomeMessage: "" },
    head_office: { welcomeMessage: "" },
    admin: { welcomeMessage: "" },
    marketing: { welcomeMessage: "" },
    member: { welcomeMessage: "" },
    staff: { welcomeMessage: "" },
  },
  checklistOverrides: {
    owner: {},
    head_office: {},
    admin: {},
    marketing: {},
    member: {},
    staff: {},
  },
  welcomePack: {
    welcomeIntro:
      "Dear {{parentName}}{{childRef}},\n\nThank you for your interest in Amana OSHC at {{centreName}}. We are delighted to share this welcome pack with you. Amana OSHC provides government-subsidised before and after school care rooted in Islamic values. We focus on the intellectual, physical, and spiritual growth of every child. Our tagline is \"Beyond The Bell\".",
    ratesIntro:
      "Most families are eligible for the Child Care Subsidy (CCS) through Centrelink, which can significantly reduce your out-of-pocket cost. Some families pay as little as $4 to $8 per session depending on their household income and activity level. Once enrolled, our team can help you estimate your cost.",
    enrolSteps:
      "1. Visit amanaoshc.com.au and click 'Enrol Now' on the homepage.\n2. Complete the online enrolment form — it takes about 10 minutes.\n3. Set up your Child Care Subsidy (CCS) via myGov and link it to Amana OSHC.\n4. Our team will confirm your child's placement and start date.\n\nIf you need help at any stage, call us on 1300 200 262 or email contact@amanaoshc.com.au.",
    contactPhone: "1300 200 262",
    contactEmail: "contact@amanaoshc.com.au",
    contactWebsite: "amanaoshc.com.au",
    footerLine: "Amana OSHC — Beyond The Bell  |  amanaoshc.com.au  |  1300 200 262",
    programmes: [
      { name: "Rise and Shine Club", desc: "Before School Care (BSC) — 6:45am to school start. A calm, structured morning to fuel your child for the day." },
      { name: "Amana Afternoons", desc: "After School Care (ASC) — school end to 6:30pm. Structured programme with rotating activities." },
      { name: "Homework Heroes", desc: "Dedicated homework support time with educators to help your child stay on top of schoolwork." },
      { name: "Little Champions Club", desc: "Sports, team games, and physical activity sessions to keep children active and healthy." },
      { name: "Imagination Station", desc: "Arts, crafts, and STEM projects that spark creativity and problem-solving skills." },
      { name: "Iqra Circle", desc: "Quran recitation and Islamic studies in a nurturing, inclusive environment." },
      { name: "Fuel Up with Amana", desc: "Cooking and nutrition workshops where children learn healthy eating habits." },
      { name: "Holiday Quest", desc: "Full-day vacation care during school holidays with excursions, cooking, sports, and themed activities." },
    ],
  },
  onboardingWelcome: {
    title: "Welcome to the Amana Dashboard",
    body: `Hi team 👋

Welcome to the Amana Dashboard — your new central hub for tasks, communication, compliance, and everything you need to run your centre smoothly.

**Your first week:**
- You'll find a few onboarding tasks in your To-Dos — work through them at your own pace
- Check back here for updates and announcements from head office
- If something looks confusing, check the Getting Started guide in the sidebar

**Need help?**
Reach out to the leadership team anytime — we're here to make sure this works for you, not the other way around.

Let's make this a great rollout! 🚀`,
  },
};

// ─── Merger ─────────────────────────────────────────────────────────────────

/**
 * Deep-merge an arbitrary partial settings object on top of the defaults.
 * Returns a complete `OrgSettingsConfig` so callers never need `?.` chains.
 *
 * Permissive on read: drops invalid types silently and falls back to the
 * default for that field. Validation belongs at the write boundary (in
 * the PATCH route), not here.
 */
export function mergeOrgSettings(
  partial: unknown,
  defaults: OrgSettingsConfig = ORG_SETTINGS_DEFAULTS,
): OrgSettingsConfig {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  const email = (safe.email && typeof safe.email === "object" ? safe.email : {}) as Record<
    string,
    unknown
  >;
  const ratios = (safe.ratios && typeof safe.ratios === "object" ? safe.ratios : {}) as Record<
    string,
    unknown
  >;
  const hs = (safe.healthScore && typeof safe.healthScore === "object"
    ? safe.healthScore
    : {}) as Record<string, unknown>;
  const hsW = (hs.pillarWeights && typeof hs.pillarWeights === "object"
    ? hs.pillarWeights
    : {}) as Record<string, unknown>;
  const hsT = (hs.thresholds && typeof hs.thresholds === "object"
    ? hs.thresholds
    : {}) as Record<string, unknown>;
  const rl = (safe.roleLabels && typeof safe.roleLabels === "object"
    ? safe.roleLabels
    : {}) as Record<string, unknown>;
  const pickLabel = (key: keyof RoleLabels): string =>
    typeof rl[key] === "string" && (rl[key] as string).length > 0
      ? (rl[key] as string)
      : defaults.roleLabels[key];

  return {
    email: {
      senderEmail:
        typeof email.senderEmail === "string" && email.senderEmail.length > 0
          ? (email.senderEmail as string)
          : defaults.email.senderEmail,
      senderName:
        typeof email.senderName === "string" && email.senderName.length > 0
          ? (email.senderName as string)
          : defaults.email.senderName,
    },
    ratios: {
      federalDefaultMinRatio:
        typeof ratios.federalDefaultMinRatio === "string" &&
        /^\d+:\d+$/.test(ratios.federalDefaultMinRatio)
          ? (ratios.federalDefaultMinRatio as string)
          : defaults.ratios.federalDefaultMinRatio,
    },
    healthScore: {
      pillarWeights: {
        financial:
          typeof hsW.financial === "number"
            ? (hsW.financial as number)
            : defaults.healthScore.pillarWeights.financial,
        operational:
          typeof hsW.operational === "number"
            ? (hsW.operational as number)
            : defaults.healthScore.pillarWeights.operational,
        compliance:
          typeof hsW.compliance === "number"
            ? (hsW.compliance as number)
            : defaults.healthScore.pillarWeights.compliance,
        satisfaction:
          typeof hsW.satisfaction === "number"
            ? (hsW.satisfaction as number)
            : defaults.healthScore.pillarWeights.satisfaction,
        teamCulture:
          typeof hsW.teamCulture === "number"
            ? (hsW.teamCulture as number)
            : defaults.healthScore.pillarWeights.teamCulture,
      },
      thresholds: {
        green:
          typeof hsT.green === "number"
            ? (hsT.green as number)
            : defaults.healthScore.thresholds.green,
        amber:
          typeof hsT.amber === "number"
            ? (hsT.amber as number)
            : defaults.healthScore.thresholds.amber,
      },
    },
    roleLabels: {
      owner: pickLabel("owner"),
      head_office: pickLabel("head_office"),
      admin: pickLabel("admin"),
      marketing: pickLabel("marketing"),
      member: pickLabel("member"),
      staff: pickLabel("staff"),
    },
    roleGuides: mergeRoleGuides(safe.roleGuides, defaults.roleGuides),
    checklistOverrides: mergeChecklistOverrides(
      safe.checklistOverrides,
      defaults.checklistOverrides,
    ),
    onboardingWelcome: mergeOnboardingWelcome(
      safe.onboardingWelcome,
      defaults.onboardingWelcome,
    ),
    welcomePack: mergeWelcomePack(safe.welcomePack, defaults.welcomePack),
  };
}

function mergeWelcomePack(
  partial: unknown,
  defaults: OrgSettingsConfig["welcomePack"],
): OrgSettingsConfig["welcomePack"] {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  const str = (k: keyof OrgSettingsConfig["welcomePack"]) =>
    typeof safe[k] === "string" && (safe[k] as string).length > 0
      ? (safe[k] as string)
      : (defaults[k] as string);
  const progRaw = Array.isArray(safe.programmes) ? safe.programmes : [];
  const programmes = progRaw
    .filter((p) => p && typeof p === "object")
    .map((p) => {
      const obj = p as Record<string, unknown>;
      return {
        name: typeof obj.name === "string" ? obj.name : "",
        desc: typeof obj.desc === "string" ? obj.desc : "",
      };
    })
    .filter((p) => p.name.length > 0 || p.desc.length > 0);
  return {
    welcomeIntro: str("welcomeIntro"),
    ratesIntro: str("ratesIntro"),
    enrolSteps: str("enrolSteps"),
    contactPhone: str("contactPhone"),
    contactEmail: str("contactEmail"),
    contactWebsite: str("contactWebsite"),
    footerLine: str("footerLine"),
    programmes: programmes.length > 0 ? programmes : defaults.programmes,
  };
}

function mergeOnboardingWelcome(
  partial: unknown,
  defaults: OrgSettingsConfig["onboardingWelcome"],
): OrgSettingsConfig["onboardingWelcome"] {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  return {
    title:
      typeof safe.title === "string" && safe.title.length > 0
        ? (safe.title as string)
        : defaults.title,
    body:
      typeof safe.body === "string" && safe.body.length > 0
        ? (safe.body as string)
        : defaults.body,
  };
}

function mergeRoleGuides(
  partial: unknown,
  defaults: OrgSettingsConfig["roleGuides"],
): OrgSettingsConfig["roleGuides"] {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  const pick = (k: keyof OrgSettingsConfig["roleGuides"]) => {
    const entry = (safe[k] && typeof safe[k] === "object" ? safe[k] : {}) as Record<
      string,
      unknown
    >;
    return {
      welcomeMessage:
        typeof entry.welcomeMessage === "string"
          ? (entry.welcomeMessage as string)
          : defaults[k].welcomeMessage,
    };
  };
  return {
    owner: pick("owner"),
    head_office: pick("head_office"),
    admin: pick("admin"),
    marketing: pick("marketing"),
    member: pick("member"),
    staff: pick("staff"),
  };
}

function mergeChecklistOverrides(
  partial: unknown,
  defaults: OrgSettingsConfig["checklistOverrides"],
): OrgSettingsConfig["checklistOverrides"] {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  const pickRole = (
    k: keyof OrgSettingsConfig["checklistOverrides"],
  ): OrgSettingsConfig["checklistOverrides"][typeof k] => {
    const entry = (safe[k] && typeof safe[k] === "object" ? safe[k] : {}) as Record<
      string,
      unknown
    >;
    const out: OrgSettingsConfig["checklistOverrides"][typeof k] = {};
    for (const [itemKey, raw] of Object.entries(entry)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const cleaned: { title?: string; description?: string } = {};
      if (typeof r.title === "string") cleaned.title = r.title;
      if (typeof r.description === "string") cleaned.description = r.description;
      if (Object.keys(cleaned).length > 0) out[itemKey] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : defaults[k];
  };
  return {
    owner: pickRole("owner"),
    head_office: pickRole("head_office"),
    admin: pickRole("admin"),
    marketing: pickRole("marketing"),
    member: pickRole("member"),
    staff: pickRole("staff"),
  };
}
