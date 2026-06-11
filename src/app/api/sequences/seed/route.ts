import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { SEED_SEQUENCES } from "@/lib/sequence-seed-data";

// POST /api/sequences/seed — admin-only seed of default sequences.
// Idempotent: skips any sequence whose name already exists. The same data is
// seeded automatically on deploy via prisma/seed.ts.
export const POST = withApiAuth(async () => {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const seq of SEED_SEQUENCES) {
    const exists = await prisma.sequence.findFirst({
      where: { name: seq.name },
    });

    if (exists) {
      skipped.push(seq.name);
      continue;
    }

    await prisma.sequence.create({
      data: {
        name: seq.name,
        type: seq.type,
        triggerStage: seq.triggerStage,
        steps: {
          create: seq.steps.map((s, i) => ({
            stepNumber: i + 1,
            name: s.name,
            delayHours: s.delayHours,
            templateKey: s.templateKey,
          })),
        },
      },
    });

    created.push(seq.name);
  }

  return NextResponse.json({
    success: true,
    created,
    skipped,
    message: `Created ${created.length}, skipped ${skipped.length} (already exist)`,
  });
}, { roles: ["owner", "admin"] });
