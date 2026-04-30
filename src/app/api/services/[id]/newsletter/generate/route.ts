import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);
const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

/**
 * POST /api/services/[id]/newsletter/generate
 *
 * Reads this service's program activities, menu, upcoming events, and recent
 * parent-visible observations for the specified week, then calls the
 * `newsletter/weekly-draft` AI template.
 *
 * Returns `{ draft: string, context: {...} }` — doesn't persist anything.
 * Publishing is a separate step (POST /publish) so the coordinator can edit.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }
    if (!ADMIN_ROLES.has(session.user.role) && session.user.role !== "member") {
      throw ApiError.forbidden(
        "Only coordinators and admins can generate newsletters",
      );
    }

    const service = await prisma.service.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);

    // Program activities — pull this week's
    const activities = await prisma.programActivity.findMany({
      where: {
        serviceId: id,
        weekStart: monday,
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
      select: { title: true, day: true, description: true },
    });

    // Menu — look for current week (summary only — meals list unused here)
    const menuWeek = await prisma.menuWeek.findFirst({
      where: { serviceId: id, weekStart: monday },
      select: { id: true },
    });

    // Upcoming events (next 14d)
    const fortnight = new Date(monday);
    fortnight.setDate(fortnight.getDate() + 14);
    const events = await prisma.serviceEvent.findMany({
      where: {
        serviceId: id,
        date: { gte: now, lte: fortnight },
      },
      orderBy: { date: "asc" },
      select: { title: true, date: true, eventType: true },
    });

    // Top recent observations (parent-visible)
    const observations = await prisma.learningObservation.findMany({
      where: {
        serviceId: id,
        visibleToParent: true,
        createdAt: { gte: monday },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { title: true, narrative: true },
    });

    const variables = {
      serviceName: service.name,
      weekStart: monday.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      weekEnd: friday.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      programActivities:
        activities.length > 0
          ? activities
              .map(
                (a) =>
                  `- ${a.day}: ${a.title}${a.description ? " — " + a.description : ""}`,
              )
              .join("\n")
          : "(no activities on file for this week)",
      menu: menuWeek ? "See menu attached to program" : "(menu not yet published)",
      upcomingEvents:
        events.length > 0
          ? events
              .map(
                (e) =>
                  `- ${e.date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}: ${e.title} (${e.eventType})`,
              )
              .join("\n")
          : "(no upcoming events)",
      topObservations:
        observations.length > 0
          ? observations.map((o) => `- ${o.title}: ${o.narrative}`).join("\n")
          : "(no shareable observations this week)",
    };

    // Delegate to /api/ai/generate by posting to the same endpoint with our
    // session — simpler than re-implementing the LLM dispatch here.
    const origin = new URL(req.url).origin;
    const cookie = req.headers.get("cookie") ?? "";
    const aiRes = await fetch(`${origin}/api/ai/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        templateSlug: "newsletter/weekly-draft",
        variables,
        stream: false,
        section: "newsletter",
        metadata: { serviceId: id, weekStart: monday.toISOString() },
      }),
    });
    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({ error: "AI call failed" }));
      throw new ApiError(502, err.error || "AI call failed");
    }

    const data = await aiRes.json();
    return NextResponse.json({
      draft: data.text,
      context: variables,
      usage: data.usage,
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
