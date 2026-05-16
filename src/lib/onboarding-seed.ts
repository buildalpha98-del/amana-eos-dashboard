import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getWeekStart } from "@/lib/utils";
import { getOrgSettings } from "@/lib/org-settings";

/**
 * Owner user ID (Jayden) — all onboarding todos are assigned "from" this user.
 * Falls back to looking up the first owner if the hardcoded ID doesn't exist.
 */
const JAYDEN_USER_ID = "cmmsijsfy0001elr7qx7sfsvo";

async function getOwnerUserId(): Promise<string> {
  const owner = await prisma.user.findFirst({
    where: { id: JAYDEN_USER_ID },
    select: { id: true },
  });
  if (owner) return owner.id;

  // Fallback: first active owner
  const fallback = await prisma.user.findFirst({
    where: { role: "owner", active: true },
    select: { id: true },
  });
  return fallback?.id ?? JAYDEN_USER_ID;
}

const ONBOARDING_TODOS = [
  {
    title: "Complete your profile",
    description:
      "Add your photo, phone number, and emergency contact details to your profile. This helps the team put a face to a name and ensures we can reach you when needed.\n\nGo to: Profile (sidebar) → Edit Profile",
  },
  {
    title: "Upload your Working With Children Check",
    description:
      "Upload a copy of your current WWCC to keep your compliance records up to date.\n\nGo to: My Portal → Qualifications → Upload",
  },
  {
    title: "Review & acknowledge the Privacy Policy",
    description:
      "Read through the Amana OSHC Privacy Policy and mark it as acknowledged.\n\nGo to: Policies (sidebar) → Privacy Policy → Acknowledge",
  },
  {
    title: "Review & acknowledge The Amana Way",
    description:
      "The Amana Way outlines how we work as a team — our values, expectations, and culture.\n\nGo to: Tools → The Amana Way",
  },
  {
    title: "Set up your notification preferences",
    description:
      "Choose which notifications you want to receive so you stay informed without being overwhelmed.\n\nGo to: Profile → Notification Preferences",
  },
  {
    title: "Review your centre's compliance status",
    description:
      "Check your centre's current compliance dashboard to see what's up to date and what needs attention.\n\nGo to: Compliance (sidebar)",
  },
  {
    title: "Explore the Getting Started guide",
    description:
      "Walk through the Getting Started checklist to familiarise yourself with the dashboard. It only takes a few minutes.\n\nGo to: Getting Started (sidebar)",
  },
];

// 2026-05-16: the welcome announcement that used to live as a constant
// here has moved to OrgSettings.config.onboardingWelcome (default value
// is defined in src/lib/org-settings-shared.ts so non-server code can
// reference the same default). Owner/admin can edit it from
// /settings/organisation without a deploy.

/**
 * Seeds onboarding todos and a welcome announcement for a newly created user.
 * Safe to call multiple times — checks for existing onboarding todos to avoid duplicates.
 */
export async function seedOnboardingPackage(
  newUserId: string,
  options?: { serviceId?: string | null },
): Promise<void> {
  try {
    const ownerId = await getOwnerUserId();
    // 2026-05-16: pull the admin-editable welcome announcement seed from
    // OrgSettings.config.onboardingWelcome (falls back to the previous
    // hardcoded copy if no override is set). Lets owner/admin keep the
    // "Need help? Reach out to..." line fresh as the team evolves.
    const orgSettings = await getOrgSettings();
    const welcome = orgSettings.onboardingWelcome;
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 7);
    const weekOf = getWeekStart(dueDate);

    // Check if user already has onboarding todos (prevent duplicates)
    const existing = await prisma.todo.findFirst({
      where: {
        assigneeId: newUserId,
        title: ONBOARDING_TODOS[0].title,
        deleted: false,
      },
    });
    if (existing) return;

    // Create onboarding todos
    await prisma.todo.createMany({
      data: ONBOARDING_TODOS.map((todo) => ({
        title: todo.title,
        description: todo.description,
        assigneeId: newUserId,
        createdById: ownerId,
        serviceId: options?.serviceId ?? null,
        dueDate,
        weekOf,
        status: "pending" as const,
      })),
    });

    // Create welcome announcement (if none exists for this user recently)
    const recentAnnouncement = await prisma.announcement.findFirst({
      where: {
        title: welcome.title,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    if (!recentAnnouncement) {
      await prisma.announcement.create({
        data: {
          title: welcome.title,
          body: welcome.body,
          authorId: ownerId,
          audience: "custom",
          priority: "normal",
          publishedAt: now,
          serviceId: options?.serviceId ?? null,
        },
      });
    }
  } catch (err) {
    // Don't let onboarding seed failure break user creation
    logger.error("Onboarding seed error (non-fatal)", { err });
  }
}
