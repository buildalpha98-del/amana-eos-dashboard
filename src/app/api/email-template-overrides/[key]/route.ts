/**
 * /api/email-template-overrides/[key]
 *
 * GET    — return the manifest entry + current override (or null).
 * PATCH  — upsert the override `{ subject, body }`.
 * DELETE — drop the override (template falls back to the hardcoded default).
 *
 * Owner / admin only. Activity-logged. Cache-invalidated after writes.
 *
 * 2026-05-17.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  getEmailTemplateManifestEntry,
  EMAIL_TEMPLATE_MANIFEST,
} from "@/lib/email-template-manifest";
import {
  deleteEmailTemplateOverride,
  getEmailTemplateOverride,
  writeEmailTemplateOverride,
} from "@/lib/email-template-overrides";

type RouteCtx = { params: Promise<{ key: string }> };

const patchSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
});

async function resolveKey(context: unknown): Promise<{
  key: string;
  manifest: ReturnType<typeof getEmailTemplateManifestEntry>;
}> {
  const params = await (context as RouteCtx).params;
  const key = params?.key ?? "";
  const manifest = getEmailTemplateManifestEntry(key);
  if (!manifest) {
    throw ApiError.notFound(
      `Unknown email template key: ${key}. Known keys: ${EMAIL_TEMPLATE_MANIFEST.map((e) => e.key).join(", ")}`,
    );
  }
  return { key, manifest };
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { key, manifest } = await resolveKey(context);
    const override = await getEmailTemplateOverride(key);
    return NextResponse.json({ ...manifest, override });
  },
  { roles: ["owner", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { key } = await resolveKey(context);
    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid email template body",
        parsed.error.flatten(),
      );
    }
    const row = await writeEmailTemplateOverride({
      key,
      subject: parsed.data.subject,
      body: parsed.data.body,
      updatedById: session!.user.id,
    });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update_email_template_override",
        entityType: "EmailTemplateOverride",
        entityId: key,
        details: { subjectLength: row.subject.length, bodyLength: row.body.length },
      },
    });
    return NextResponse.json({ key, override: row });
  },
  { roles: ["owner", "admin"], rateLimit: { max: 30, windowMs: 60_000 } },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { key } = await resolveKey(context);
    try {
      await deleteEmailTemplateOverride(key);
    } catch {
      // Already absent — treat as success (idempotent).
    }
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "delete_email_template_override",
        entityType: "EmailTemplateOverride",
        entityId: key,
        details: {},
      },
    });
    return NextResponse.json({ key, override: null });
  },
  { roles: ["owner", "admin"] },
);
