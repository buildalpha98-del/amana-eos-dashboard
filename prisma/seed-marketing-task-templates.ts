/**
 * Seed marketing task templates into the database.
 * Run with: npx tsx prisma/seed-marketing-task-templates.ts
 *
 * Safe to run multiple times — skips templates that already exist (by name).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const allTemplates = [
  // ── 1. New Social Campaign Launch ─────────────────────────
  {
    name: "New Social Campaign Launch",
    description:
      "End-to-end workflow for launching a new social media campaign — from creative brief through to go-live and performance tracking.",
    category: "Social Media",
    items: [
      {
        title: "Write creative brief",
        description: "Define campaign objectives, key messages, tone of voice, and deliverables.",
        priority: "high" as const,
        sortOrder: 1,
        daysOffset: 0,
      },
      {
        title: "Define target audience",
        description: "Research and document audience demographics, interests, and platform behaviour.",
        priority: "high" as const,
        sortOrder: 2,
        daysOffset: 1,
      },
      {
        title: "Build content calendar",
        description: "Map out post schedule across platforms with dates, formats, and themes.",
        priority: "medium" as const,
        sortOrder: 3,
        daysOffset: 2,
      },
      {
        title: "Brief designer on visuals",
        description: "Share brand guidelines, dimensions, and visual direction with the design team.",
        priority: "medium" as const,
        sortOrder: 4,
        daysOffset: 3,
      },
      {
        title: "Write post copy",
        description: "Draft captions, CTAs, and body copy for each scheduled post.",
        priority: "medium" as const,
        sortOrder: 5,
        daysOffset: 5,
      },
      {
        title: "Internal review round",
        description: "Circulate draft posts to stakeholders for feedback and sign-off.",
        priority: "medium" as const,
        sortOrder: 6,
        daysOffset: 7,
      },
      {
        title: "Research and finalise hashtags",
        description: "Compile relevant hashtags for reach, engagement, and brand alignment.",
        priority: "low" as const,
        sortOrder: 7,
        daysOffset: 8,
      },
      {
        title: "Final approval",
        description: "Obtain sign-off from marketing lead or director before scheduling.",
        priority: "high" as const,
        sortOrder: 8,
        daysOffset: 10,
      },
      {
        title: "Schedule all posts",
        description: "Load approved content into the scheduling tool with correct dates and times.",
        priority: "medium" as const,
        sortOrder: 9,
        daysOffset: 12,
      },
      {
        title: "Launch and monitor",
        description: "Go live, monitor engagement, respond to comments, and track early metrics.",
        priority: "high" as const,
        sortOrder: 10,
        daysOffset: 14,
      },
    ],
  },

  // ── 2. Monthly Content Calendar ───────────────────────────
  {
    name: "Monthly Content Calendar",
    description:
      "Recurring monthly workflow to plan, produce, and publish content across all marketing channels.",
    category: "Content",
    items: [
      {
        title: "Review last month's performance",
        description: "Analyse engagement, reach, and conversion data from the previous month.",
        priority: "high" as const,
        sortOrder: 1,
        daysOffset: 0,
      },
      {
        title: "Brainstorm content ideas",
        description: "Host a team brainstorm session to generate themes, topics, and formats.",
        priority: "medium" as const,
        sortOrder: 2,
        daysOffset: 2,
      },
      {
        title: "Assign content to team members",
        description: "Allocate topics, deadlines, and platforms to writers and designers.",
        priority: "medium" as const,
        sortOrder: 3,
        daysOffset: 3,
      },
      {
        title: "Draft all content pieces",
        description: "Write blog posts, social captions, email copy, and other deliverables.",
        priority: "high" as const,
        sortOrder: 4,
        daysOffset: 5,
      },
      {
        title: "Create visual assets",
        description: "Design graphics, photos, and video thumbnails for each content piece.",
        priority: "medium" as const,
        sortOrder: 5,
        daysOffset: 8,
      },
      {
        title: "Review and approve content",
        description: "Proofread, fact-check, and get stakeholder approval on all content.",
        priority: "high" as const,
        sortOrder: 6,
        daysOffset: 12,
      },
      {
        title: "Schedule content for publication",
        description: "Load content into CMS, social scheduler, and email platform.",
        priority: "medium" as const,
        sortOrder: 7,
        daysOffset: 14,
      },
      {
        title: "Compile monthly performance report",
        description: "Document results, insights, and recommendations for the next cycle.",
        priority: "low" as const,
        sortOrder: 8,
        daysOffset: 21,
      },
    ],
  },

  // ── 3. Centre Spotlight Feature ───────────────────────────
  {
    name: "Centre Spotlight Feature",
    description:
      "Create a feature spotlight showcasing a specific centre — great for community engagement and parent trust.",
    category: "Community",
    items: [
      {
        title: "Select centre and coordinate with staff",
        description: "Choose the featured centre and confirm timing with the centre coordinator.",
        priority: "high" as const,
        sortOrder: 1,
        daysOffset: 0,
      },
      {
        title: "Capture photos and video",
        description: "Visit the centre to take high-quality photos of activities, staff, and environment.",
        priority: "high" as const,
        sortOrder: 2,
        daysOffset: 2,
      },
      {
        title: "Write feature copy",
        description: "Draft the spotlight article or social post including quotes and highlights.",
        priority: "medium" as const,
        sortOrder: 3,
        daysOffset: 4,
      },
      {
        title: "Design graphics and layout",
        description: "Create branded graphics, carousels, or story templates for the feature.",
        priority: "medium" as const,
        sortOrder: 4,
        daysOffset: 5,
      },
      {
        title: "Approve with centre and management",
        description: "Share draft with the centre coordinator and management for sign-off.",
        priority: "high" as const,
        sortOrder: 5,
        daysOffset: 7,
      },
      {
        title: "Publish across channels",
        description: "Post the spotlight on social media, website, and/or newsletter.",
        priority: "medium" as const,
        sortOrder: 6,
        daysOffset: 10,
      },
    ],
  },

  // ── 4. Event / Activation Prep ────────────────────────────
  {
    name: "Event / Activation Prep",
    description:
      "Step-by-step preparation for marketing events, open days, and community activations.",
    category: "Events",
    items: [
      {
        title: "Confirm event details and logistics",
        description: "Lock in date, venue, time, and key stakeholders for the event.",
        priority: "high" as const,
        sortOrder: 1,
        daysOffset: 0,
      },
      {
        title: "Write event brief",
        description: "Document objectives, target audience, messaging, and required deliverables.",
        priority: "high" as const,
        sortOrder: 2,
        daysOffset: 1,
      },
      {
        title: "Design promotional materials",
        description: "Create flyers, posters, banners, and digital assets for event promotion.",
        priority: "medium" as const,
        sortOrder: 3,
        daysOffset: 3,
      },
      {
        title: "Launch social media promotion",
        description: "Schedule teaser posts, event countdowns, and share across platforms.",
        priority: "medium" as const,
        sortOrder: 4,
        daysOffset: 5,
      },
      {
        title: "Set up RSVP and registration",
        description: "Create sign-up form or event page and share the link with invitees.",
        priority: "medium" as const,
        sortOrder: 5,
        daysOffset: 7,
      },
      {
        title: "Post countdown reminders",
        description: "Send reminder emails and social posts as the event date approaches.",
        priority: "low" as const,
        sortOrder: 6,
        daysOffset: 12,
      },
      {
        title: "Live coverage on the day",
        description: "Capture photos, stories, and live updates during the event.",
        priority: "high" as const,
        sortOrder: 7,
        daysOffset: 14,
      },
      {
        title: "Post-event wrap-up and recap",
        description: "Share highlights, thank-yous, and metrics from the event.",
        priority: "medium" as const,
        sortOrder: 8,
        daysOffset: 16,
      },
    ],
  },

  // ── 5. End of Term Newsletter ─────────────────────────────
  {
    name: "End of Term Newsletter",
    description:
      "Produce and distribute an end-of-term newsletter covering highlights, achievements, and upcoming plans.",
    category: "Communications",
    items: [
      {
        title: "Gather updates from all centres",
        description: "Request highlights, achievements, and photos from each centre coordinator.",
        priority: "high" as const,
        sortOrder: 1,
        daysOffset: 0,
      },
      {
        title: "Collect and curate photos",
        description: "Select the best photos and ensure parent permissions are in place.",
        priority: "medium" as const,
        sortOrder: 2,
        daysOffset: 3,
      },
      {
        title: "Write newsletter articles",
        description: "Draft feature stories, updates, and upcoming term previews.",
        priority: "high" as const,
        sortOrder: 3,
        daysOffset: 5,
      },
      {
        title: "Design newsletter layout",
        description: "Lay out content in the email template with branding and formatting.",
        priority: "medium" as const,
        sortOrder: 4,
        daysOffset: 8,
      },
      {
        title: "Proofread and final review",
        description: "Check for typos, broken links, and ensure all content is accurate.",
        priority: "high" as const,
        sortOrder: 5,
        daysOffset: 10,
      },
      {
        title: "Send newsletter to families",
        description: "Distribute via email platform to the parent mailing list.",
        priority: "high" as const,
        sortOrder: 6,
        daysOffset: 14,
      },
      {
        title: "Analyse open rates and engagement",
        description: "Review email metrics and document learnings for the next newsletter.",
        priority: "low" as const,
        sortOrder: 7,
        daysOffset: 21,
      },
    ],
  },

  // ── 6. Brand Awareness Campaign ───────────────────────────
  {
    name: "Brand Awareness Campaign",
    description:
      "Strategic campaign to increase brand recognition and reach across digital channels.",
    category: "Brand",
    items: [
      {
        title: "Define brand messaging and positioning",
        description: "Clarify key messages, value propositions, and tone for the campaign.",
        priority: "high" as const,
        sortOrder: 1,
        daysOffset: 0,
      },
      {
        title: "Audit current brand presence",
        description: "Review website, social profiles, and collateral for consistency and gaps.",
        priority: "medium" as const,
        sortOrder: 2,
        daysOffset: 2,
      },
      {
        title: "Build content library",
        description: "Create a bank of branded images, videos, testimonials, and copy blocks.",
        priority: "medium" as const,
        sortOrder: 3,
        daysOffset: 4,
      },
      {
        title: "Design ad creatives",
        description: "Produce display ads, social media ads, and banner designs in brand style.",
        priority: "high" as const,
        sortOrder: 4,
        daysOffset: 6,
      },
      {
        title: "Write ad copy and CTAs",
        description: "Craft compelling headlines, body copy, and calls to action for each ad set.",
        priority: "medium" as const,
        sortOrder: 5,
        daysOffset: 8,
      },
      {
        title: "Set up audience targeting",
        description: "Configure targeting parameters in ad platforms based on audience research.",
        priority: "high" as const,
        sortOrder: 6,
        daysOffset: 10,
      },
      {
        title: "Launch campaign",
        description: "Activate ads and organic content across all selected channels.",
        priority: "high" as const,
        sortOrder: 7,
        daysOffset: 14,
      },
      {
        title: "Weekly performance check-ins",
        description: "Monitor KPIs, adjust targeting, and optimise creative based on results.",
        priority: "medium" as const,
        sortOrder: 8,
        daysOffset: 21,
      },
    ],
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const tmpl of allTemplates) {
    const existing = await prisma.marketingTaskTemplate.findFirst({
      where: { name: tmpl.name },
    });
    if (existing) {
      console.log(`  ✓ "${tmpl.name}" already exists`);
      skipped++;
      continue;
    }
    await prisma.marketingTaskTemplate.create({
      data: {
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        items: { create: tmpl.items },
      },
    });
    console.log(`  + Created "${tmpl.name}" (${tmpl.items.length} items)`);
    created++;
  }

  console.log(`\nDone! Created ${created}, skipped ${skipped} (already exist).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
