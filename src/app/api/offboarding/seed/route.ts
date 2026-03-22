import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
/**
 * POST /api/offboarding/seed
 *
 * Owner-only endpoint that seeds a default offboarding pack.
 * Safe to call multiple times -- skips packs that already exist by name.
 *
 * Run from browser console:
 *   fetch('/api/offboarding/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
 */

const DEFAULT_PACK = {
  name: "Standard Staff Offboarding",
  description:
    "Default offboarding checklist for departing OSHC staff. Covers equipment return, system access removal, final pay, exit interview, and knowledge transfer.",
  isDefault: true,
  tasks: [
    {
      title: "Return Keys",
      category: "equipment",
      sortOrder: 1,
      isRequired: true,
    },
    {
      title: "Deactivate System Access",
      category: "access",
      sortOrder: 2,
      isRequired: true,
    },
    {
      title: "Return Equipment",
      category: "equipment",
      sortOrder: 3,
      isRequired: true,
    },
    {
      title: "Final Pay Calculation",
      category: "payroll",
      sortOrder: 4,
      isRequired: true,
    },
    {
      title: "Outstanding Leave Payout",
      category: "payroll",
      sortOrder: 5,
      isRequired: true,
    },
    {
      title: "Exit Interview",
      category: "exit_interview",
      sortOrder: 6,
      isRequired: true,
    },
    {
      title: "Update Emergency Contact Lists",
      category: "documentation",
      sortOrder: 7,
      isRequired: true,
    },
    {
      title: "Transfer Knowledge/Handover",
      category: "documentation",
      sortOrder: 8,
      isRequired: true,
    },
    {
      title: "Remove from Communication Groups",
      category: "access",
      sortOrder: 9,
      isRequired: true,
    },
    {
      title: "Archive Staff Files",
      category: "documentation",
      sortOrder: 10,
      isRequired: true,
    },
  ],
};

export const POST = withApiAuth(async (req, session) => {
  try {
    const existing = await prisma.offboardingPack.findFirst({
      where: { name: DEFAULT_PACK.name, deleted: false },
    });

    if (existing) {
      return NextResponse.json({
        message: "Default offboarding pack already exists.",
        created: [],
        total: 1,
      });
    }

    await prisma.offboardingPack.create({
      data: {
        name: DEFAULT_PACK.name,
        description: DEFAULT_PACK.description,
        isDefault: DEFAULT_PACK.isDefault,
        tasks: {
          create: DEFAULT_PACK.tasks.map((t) => ({
            title: t.title,
            category: t.category,
            sortOrder: t.sortOrder,
            isRequired: t.isRequired,
          })),
        },
      },
    });

    return NextResponse.json({
      message: "Seeded 1 offboarding pack.",
      created: [DEFAULT_PACK.name],
      total: 1,
    });
  } catch (err) {
    logger.error("Offboarding seed error", { err });
    return NextResponse.json(
      { error: "Failed to seed offboarding pack" },
      { status: 500 }
    );
  }
}, { roles: ["owner"] });
