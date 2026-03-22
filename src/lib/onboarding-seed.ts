import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
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

const WELCOME_ANNOUNCEMENT = {
  title: "Welcome to the Amana Dashboard",
  body: `Hi team 👋

Welcome to the Amana Dashboard — your new central hub for tasks, communication, compliance, and everything you need to run your centre smoothly.

**Your first week:**
- You'll find a few onboarding tasks in your To-Dos — work through them at your own pace
- Check back here for updates and announcements from head office
- If something looks confusing, check the Getting Started guide in the sidebar

**Need help?**
Reach out to Jayden or Daniel anytime — we're here to make sure this works for you, not the other way around.

Let's make this a great rollout! 🚀`,
};

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
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 7);
    const weekOf = getMonday(dueDate);

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
        title: WELCOME_ANNOUNCEMENT.title,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    if (!recentAnnouncement) {
      await prisma.announcement.create({
        data: {
          title: WELCOME_ANNOUNCEMENT.title,
          body: WELCOME_ANNOUNCEMENT.body,
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
