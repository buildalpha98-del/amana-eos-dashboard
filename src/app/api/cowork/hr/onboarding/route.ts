import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * GET /api/cowork/hr/onboarding
 *
 * Returns onboarding and offboarding progress for all staff.
 * Scope: hr:read
 *
 * Query params:
 *   - serviceId (optional)
 *   - status: "not_started" | "in_progress" | "completed" | "all" (default "all")
 *   - type: "onboarding" | "offboarding" | "all" (default "all")
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status") || "all";
  const type = searchParams.get("type") || "all";

  try {
    const results: Array<{
      id: string;
      type: "onboarding" | "offboarding";
      staff: { id: string; name: string; email: string };
      service: { id: string; name: string; code: string } | null;
      packName: string;
      status: string;
      totalTasks: number;
      completedTasks: number;
      progressPercent: number;
      startedAt: string | null;
      completedAt: string | null;
      dueDate: string | null;
      lastDay: string | null;
    }> = [];

    // Onboarding records
    if (type === "all" || type === "onboarding") {
      const onboardingWhere: Record<string, unknown> = {};
      if (status !== "all") onboardingWhere.status = status;
      if (serviceId) onboardingWhere.user = { serviceId };

      const onboardings = await prisma.staffOnboarding.findMany({
        where: onboardingWhere,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              service: { select: { id: true, name: true, code: true } },
            },
          },
          pack: { select: { name: true } },
          progress: { select: { completed: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      for (const ob of onboardings) {
        const totalTasks = ob.progress.length;
        const completedTasks = ob.progress.filter((p) => p.completed).length;
        results.push({
          id: ob.id,
          type: "onboarding",
          staff: { id: ob.user.id, name: ob.user.name, email: ob.user.email },
          service: ob.user.service,
          packName: ob.pack.name,
          status: ob.status,
          totalTasks,
          completedTasks,
          progressPercent:
            totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          startedAt: ob.startedAt?.toISOString() || null,
          completedAt: ob.completedAt?.toISOString() || null,
          dueDate: ob.dueDate?.toISOString() || null,
          lastDay: null,
        });
      }
    }

    // Offboarding records
    if (type === "all" || type === "offboarding") {
      const offboardingWhere: Record<string, unknown> = {};
      if (status !== "all") offboardingWhere.status = status;
      if (serviceId) offboardingWhere.user = { serviceId };

      const offboardings = await prisma.staffOffboarding.findMany({
        where: offboardingWhere,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              service: { select: { id: true, name: true, code: true } },
            },
          },
          pack: { select: { name: true } },
          progress: { select: { completed: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      for (const off of offboardings) {
        const totalTasks = off.progress.length;
        const completedTasks = off.progress.filter((p) => p.completed).length;
        results.push({
          id: off.id,
          type: "offboarding",
          staff: { id: off.user.id, name: off.user.name, email: off.user.email },
          service: off.user.service,
          packName: off.pack.name,
          status: off.status,
          totalTasks,
          completedTasks,
          progressPercent:
            totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          startedAt: off.startedAt?.toISOString() || null,
          completedAt: off.completedAt?.toISOString() || null,
          dueDate: null,
          lastDay: off.lastDay?.toISOString() || null,
        });
      }
    }

    // Summary
    const summary = {
      total: results.length,
      onboarding: results.filter((r) => r.type === "onboarding").length,
      offboarding: results.filter((r) => r.type === "offboarding").length,
      inProgress: results.filter((r) => r.status === "in_progress").length,
      notStarted: results.filter((r) => r.status === "not_started").length,
      completed: results.filter((r) => r.status === "completed").length,
    };

    return NextResponse.json({ records: results, count: results.length, summary });
  } catch (err) {
    console.error("[Cowork HR Onboarding GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch onboarding data" },
      { status: 500 },
    );
  }
}
