import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import bcrypt from "bcryptjs";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
// ── Role mapping ─────────────────────────────────────────────

const ROLE_MAP: Record<string, string> = {
  owner: "owner",
  "head-office": "head_office",
  head_office: "head_office",
  admin: "admin",
  marketing: "marketing",
  coordinator: "member",
  member: "member",
  staff: "staff",
  educator: "staff",
  "service-coordinator": "member",
};

function mapRegistryRole(registryRole: string): string {
  const normalised = registryRole.toLowerCase().replace(/\s+/g, "-");
  return ROLE_MAP[normalised] || "staff";
}

// ── Types ────────────────────────────────────────────────────

const staffEntrySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().optional(),
  state: z.string().nullable().optional(),
  serviceCode: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const postBodySchema = z.object({
  staff: z.array(staffEntrySchema).min(1),
  deactivateMissing: z.boolean().optional(),
});

interface RegistryStaffEntry {
  name: string;
  email: string;
  role?: string;
  state?: string | null;
  serviceCode?: string | null;
  phone?: string | null;
  active?: boolean;
}

/**
 * POST /api/cowork/staff/sync — Upsert staff from an external registry
 *
 * Auth: API key with `staff:sync` scope
 * Body: { staff: RegistryStaffEntry[], deactivateMissing?: boolean }
 *
 * - Creates new users with a random password (they use password reset to set theirs)
 * - Updates role, state, serviceId, phone, active status for existing users
 * - Optionally deactivates users not in the registry (owner/head_office excluded)
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { staff, deactivateMissing = false } = parsed.data;

    // Pre-resolve service codes → IDs
    const serviceCodes = [
      ...new Set(
        staff
          .map((s) => s.serviceCode)
          .filter((c): c is string => c != null && c !== "")
      ),
    ];
    const services = serviceCodes.length
      ? await prisma.service.findMany({
          where: { code: { in: serviceCodes } },
          select: { id: true, code: true },
        })
      : [];
    const serviceMap = new Map(services.map((s) => [s.code, s.id]));

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const syncedEmails = new Set<string>();

    for (const entry of staff) {
      if (!entry.email || !entry.name) {
        skipped.push(entry.email || "(no email)");
        continue;
      }

      const email = entry.email.toLowerCase().trim();
      syncedEmails.add(email);

      const role = entry.role ? mapRegistryRole(entry.role) : "staff";
      const serviceId = entry.serviceCode
        ? serviceMap.get(entry.serviceCode) || null
        : null;

      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing) {
        // Never downgrade owner or head_office roles via sync —
        // those are set manually in the dashboard and the registry
        // shouldn't be able to override them.
        const privileged = existing.role === "owner" || existing.role === "head_office";
        const newRole = entry.role && !privileged ? (role as any) : existing.role;

        // Update existing user
        await prisma.user.update({
          where: { email },
          data: {
            name: entry.name,
            role: newRole,
            state: entry.state ?? existing.state,
            serviceId: serviceId ?? existing.serviceId,
            phone: entry.phone ?? existing.phone,
            active: entry.active !== undefined ? entry.active : existing.active,
          },
        });
        updated.push(email);
      } else {
        // Create new user with random password
        const tempPassword = `Welcome_${Math.random().toString(36).slice(2, 10)}!`;
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        await prisma.user.create({
          data: {
            name: entry.name,
            email,
            passwordHash,
            role: role as any,
            state: entry.state || null,
            serviceId,
            phone: entry.phone || null,
            active: entry.active !== false,
            notificationPrefs: getDefaultNotificationPrefs(role),
          },
        });
        created.push(email);
      }
    }

    // Optionally deactivate users not in the registry
    let deactivated: string[] = [];
    if (deactivateMissing) {
      const toDeactivate = await prisma.user.findMany({
        where: {
          email: { notIn: Array.from(syncedEmails) },
          active: true,
          role: { notIn: ["owner", "head_office"] },
        },
        select: { email: true },
      });

      if (toDeactivate.length > 0) {
        await prisma.user.updateMany({
          where: {
            email: { in: toDeactivate.map((u) => u.email) },
          },
          data: { active: false },
        });
        deactivated = toDeactivate.map((u) => u.email);
      }
    }

    return NextResponse.json(
      {
        summary: {
          created: created.length,
          updated: updated.length,
          skipped: skipped.length,
          deactivated: deactivated.length,
        },
        created,
        updated,
        skipped,
        deactivated,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Staff sync failed", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * GET /api/cowork/staff/sync — Retrieve current active staff list
 *
 * Auth: API key with `staff:sync` scope
 * Query: ?active=true (default: true)
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") !== "false";

  const users = await prisma.user.findMany({
    where: activeOnly ? { active: true } : {},
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      state: true,
      active: true,
      phone: true,
      serviceId: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ staff: users, total: users.length });
});
