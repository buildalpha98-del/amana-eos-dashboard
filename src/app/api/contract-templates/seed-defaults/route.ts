/**
 * POST /api/contract-templates/seed-defaults
 *
 * Owner-only: seeds (or resets) the built-in preset contract templates.
 * Idempotent — safe to call repeatedly.
 *
 * Behaviour:
 *   - If a template with the preset's name already exists, its
 *     content + manualFields are OVERWRITTEN with the current preset
 *     and status is re-activated. This is by design: presets are
 *     considered the canonical source, and clicking "Seed defaults"
 *     is understood to mean "restore this to the built-in version".
 *   - If it doesn't exist, it's created.
 *
 * Rationale for upsert: on 2026-07-13 Daniel seeded the casual
 * educator preset, then hit a bug where custom tags weren't
 * surfacing at issue time. The fix updated the preset content, but
 * the endpoint's skip-if-exists guard prevented the new content from
 * landing until the row was manually removed — which itself was
 * blocked because contracts referenced the template. Upsert makes
 * the button self-healing.
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
import {
  COORDINATOR_PERMANENT_TEMPLATE_NAME,
  COORDINATOR_PERMANENT_TEMPLATE_DESCRIPTION,
  COORDINATOR_PERMANENT_CONTENT_JSON,
  COORDINATOR_PERMANENT_MANUAL_FIELDS,
} from "@/lib/contract-templates/coordinator-permanent-preset";

const PRESETS = [
  {
    name: CASUAL_EDUCATOR_TEMPLATE_NAME,
    description: CASUAL_EDUCATOR_TEMPLATE_DESCRIPTION,
    contentJson: CASUAL_EDUCATOR_CONTENT_JSON,
    manualFields: CASUAL_EDUCATOR_MANUAL_FIELDS,
  },
  {
    name: COORDINATOR_PERMANENT_TEMPLATE_NAME,
    description: COORDINATOR_PERMANENT_TEMPLATE_DESCRIPTION,
    contentJson: COORDINATOR_PERMANENT_CONTENT_JSON,
    manualFields: COORDINATOR_PERMANENT_MANUAL_FIELDS,
  },
] as const;

export const POST = withApiAuth(
  async (_req, session) => {
    const created: Array<{ id: string; name: string }> = [];
    const updated: Array<{ id: string; name: string }> = [];

    for (const preset of PRESETS) {
      const existing = await prisma.contractTemplate.findFirst({
        where: { name: preset.name },
        select: { id: true },
      });
      if (existing) {
        const tpl = await prisma.contractTemplate.update({
          where: { id: existing.id },
          data: {
            description: preset.description,
            contentJson: preset.contentJson as never,
            manualFields: preset.manualFields as never,
            status: "active",
            updatedById: session!.user.id,
          },
          select: { id: true, name: true },
        });
        updated.push(tpl);
      } else {
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
    }

    const parts: string[] = [];
    if (created.length)
      parts.push(
        `Created ${created.length} template${created.length === 1 ? "" : "s"}`,
      );
    if (updated.length)
      parts.push(
        `reset ${updated.length} to defaults`,
      );

    return NextResponse.json({
      created,
      updated,
      message: parts.length ? parts.join(", ") + "." : "Nothing to seed.",
    });
  },
  { roles: ["owner"], feature: "contracts.create" },
);
