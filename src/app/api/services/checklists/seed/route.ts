import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
interface SeedItem {
  category: string;
  label: string;
  sortOrder: number;
  isRequired?: boolean;
}

interface SeedChecklist {
  name: string;
  sessionType: "bsc" | "asc";
  category: string; // "daily" | "weekly"
  items: SeedItem[];
}

const SEED_CHECKLISTS: SeedChecklist[] = [
  {
    name: "Morning Open",
    sessionType: "bsc",
    category: "daily",
    items: [
      { category: "opening", label: "Unlock premises and disarm alarm", sortOrder: 1 },
      { category: "safety", label: "Complete indoor safety check (hazards, broken items, cleanliness)", sortOrder: 2 },
      { category: "safety", label: "Complete outdoor safety check (equipment, gates, shade)", sortOrder: 3 },
      { category: "opening", label: "Set up sign-in area and attendance register", sortOrder: 4 },
      { category: "safety", label: "Check first aid kit is stocked and accessible", sortOrder: 5 },
      { category: "compliance", label: "Review daily attendance list and medical alerts", sortOrder: 6 },
      { category: "compliance", label: "Confirm staff ratios meet regulatory requirements", sortOrder: 7 },
      { category: "programming", label: "Set up afternoon tea / breakfast items", sortOrder: 8 },
      { category: "programming", label: "Display daily program in visible location", sortOrder: 9 },
      { category: "compliance", label: "Brief staff on any children with specific needs today", sortOrder: 10 },
    ],
  },
  {
    name: "Evening Close",
    sessionType: "asc",
    category: "daily",
    items: [
      { category: "closing", label: "Confirm all children signed out and collected", sortOrder: 1 },
      { category: "closing", label: "Pack away equipment and resources", sortOrder: 2 },
      { category: "closing", label: "Clean and sanitise food preparation areas", sortOrder: 3 },
      { category: "compliance", label: "Complete incident/medication log entries for the day", sortOrder: 4 },
      { category: "safety", label: "Secure outdoor area and check gates locked", sortOrder: 5 },
      { category: "closing", label: "Empty bins and tidy indoor spaces", sortOrder: 6 },
      { category: "closing", label: "Set alarm and lock premises", sortOrder: 7 },
      { category: "compliance", label: "Submit daily attendance count to coordinator", sortOrder: 8 },
    ],
  },
  {
    name: "Weekly Safety Walk",
    sessionType: "asc",
    category: "weekly",
    items: [
      { category: "safety", label: "Inspect all outdoor play equipment for damage or wear", sortOrder: 1 },
      { category: "safety", label: "Check fencing and gates for security", sortOrder: 2 },
      { category: "safety", label: "Test smoke detectors and emergency lighting", sortOrder: 3 },
      { category: "safety", label: "Verify first aid supplies and restock as needed", sortOrder: 4 },
      { category: "safety", label: "Review chemical storage (cleaning products secured)", sortOrder: 5 },
      { category: "safety", label: "Check bathroom facilities (soap, paper towels, hygiene)", sortOrder: 6 },
      { category: "compliance", label: "Inspect kitchen/food prep area compliance", sortOrder: 7 },
      { category: "compliance", label: "Document any maintenance requests submitted", sortOrder: 8 },
    ],
  },
];

// POST /api/services/checklists/seed — owner-only seed of default checklists for all active services
export const POST = withApiAuth(async (req, session) => {
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  if (services.length === 0) {
    return NextResponse.json(
      { error: "No active services found" },
      { status: 404 }
    );
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const service of services) {
    for (const checklist of SEED_CHECKLISTS) {
      const key = `${service.name} — ${checklist.name}`;

      // Idempotent: skip if a checklist with same service+date+sessionType already has
      // items matching this template name (stored in notes field)
      const existing = await prisma.dailyChecklist.findFirst({
        where: {
          serviceId: service.id,
          date: today,
          sessionType: checklist.sessionType,
          notes: { contains: checklist.name },
        },
      });

      if (existing) {
        skipped.push(key);
        continue;
      }

      // Check if a checklist already exists for this service+date+sessionType
      const existingChecklist = await prisma.dailyChecklist.findUnique({
        where: {
          serviceId_date_sessionType: {
            serviceId: service.id,
            date: today,
            sessionType: checklist.sessionType,
          },
        },
      });

      if (existingChecklist) {
        skipped.push(key);
        continue;
      }

      await prisma.dailyChecklist.create({
        data: {
          serviceId: service.id,
          date: today,
          sessionType: checklist.sessionType,
          status: "pending",
          notes: `[${checklist.category}] ${checklist.name}`,
          items: {
            create: checklist.items.map((item) => ({
              category: item.category,
              label: item.label,
              sortOrder: item.sortOrder,
              isRequired: item.isRequired ?? true,
              checked: false,
            })),
          },
        },
      });

      created.push(key);
    }
  }

  return NextResponse.json({
    success: true,
    servicesCount: services.length,
    created,
    skipped,
    message: `Created ${created.length} checklists, skipped ${skipped.length} (already exist)`,
  });
}, { roles: ["owner"] });
