/**
 * POST /api/contract-templates/seed-defaults
 *
 * Owner-only one-off: seeds the built-in "OSHC Educator — Casual"
 * template if it doesn't already exist. Idempotent — safe to call
 * multiple times; each call reports which templates were created vs
 * skipped.
 *
 * Exists so Daniel can rebuild his lost templates with a single button
 * click from /contracts/templates without needing local prod DB access.
 * Future default presets (permanent educator, coordinator, etc.) can
 * plug into the same endpoint.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import {
  CASUAL_EDUCATOR_TEMPLATE_NAME,
  CASUAL_EDUCATOR_TEMPLATE_DESCRIPTION,
  CASUAL_EDUCATOR_CONTENT_JSON,
  CASUAL_EDUCATOR_MANUAL_FIELDS,
} from "@/lib/contract-templates/casual-educator-preset";

const PRESETS = [
  {
    name: CASUAL_EDUCATOR_TEMPLATE_NAME,
    description: CASUAL_EDUCATOR_TEMPLATE_DESCRIPTION,
    contentJson: CASUAL_EDUCATOR_CONTENT_JSON,
    manualFields: CASUAL_EDUCATOR_MANUAL_FIELDS,
  },
] as const;

export const POST = withApiAuth(
  async (_req, session) => {
    const created: Array<{ id: string; name: string }> = [];
    const skipped: string[] = [];

    for (const preset of PRESETS) {
      const existing = await prisma.contractTemplate.findFirst({
        where: { name: preset.name },
        select: { id: true },
      });
      if (existing) {
        skipped.push(preset.name);
        continue;
      }
      const tpl = await prisma.contractTemplate.create({
        data: {
          name: preset.name,
          description: preset.description,
          contentJson: preset.contentJson as never,
          manualFields: preset.manualFields as never,
          createdById: session!.user.id,
        },
        select: { id: true, name: true },
      });
      created.push(tpl);
    }

    return NextResponse.json({
      created,
      skipped,
      message:
        created.length === 0
          ? "All default templates already exist — nothing seeded."
          : `Seeded ${created.length} template${created.length === 1 ? "" : "s"}.`,
    });
  },
  { roles: ["owner"], feature: "contracts.create" },
);
