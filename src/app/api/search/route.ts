import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/search?q= — global ⌘K search.
 *
 * 2026-07-05: role-scoped + three new entity types (children, CRM
 * leads, enquiries). Previously every authenticated role could search
 * all org rocks/issues/projects and every user's email; now the result
 * set matches what each role's pages actually show:
 *  - owner/head_office/admin: everything, org-wide
 *  - marketing: EOS + services + people + leads + enquiries (no children)
 *  - member (Director of Service): services + people + own-service
 *    children and own-service EOS items
 *  - staff (Educator): services + people + own to-dos
 *  - eos_viewer / eos_implementer: EOS + services + people
 */

const ADMIN_TIER = new Set(["owner", "head_office", "admin"]);
const EOS_ROLES = new Set(["eos_viewer", "eos_implementer", "marketing"]);

export const GET = withApiAuth(async (req, session) => {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const role = session.user.role ?? "";
  const userId = session.user.id;
  const serviceId = (session.user as { serviceId?: string | null }).serviceId ?? null;

  const isAdmin = ADMIN_TIER.has(role);
  const isMember = role === "member";
  const isStaff = role === "staff";
  const canSeeEos = isAdmin || isMember || EOS_ROLES.has(role);
  const canSeeChildren = isAdmin || (isMember && !!serviceId);
  const canSeeCrm = isAdmin || role === "marketing";

  const filter = { contains: q, mode: "insensitive" as const };
  // member's EOS + children results stay inside their own centre.
  const memberScope = isMember && serviceId ? { serviceId } : {};

  const [rocks, todos, issues, services, projects, people, children, leads, enquiries] =
    await Promise.all([
      canSeeEos
        ? prisma.rock.findMany({
            where: { deleted: false, title: filter, ...(isMember ? memberScope : {}) },
            select: { id: true, title: true, status: true },
            take: 5,
          })
        : [],
      // Staff still find their own to-dos; everyone else searches org-wide.
      canSeeEos || isStaff
        ? prisma.todo.findMany({
            where: {
              deleted: false,
              title: filter,
              ...(isStaff ? { assigneeId: userId } : {}),
              ...(isMember ? memberScope : {}),
            },
            select: { id: true, title: true, status: true },
            take: 5,
          })
        : [],
      canSeeEos
        ? prisma.issue.findMany({
            where: { deleted: false, title: filter, ...(isMember ? memberScope : {}) },
            select: { id: true, title: true, status: true },
            take: 5,
          })
        : [],
      prisma.service.findMany({
        where: { name: filter },
        select: { id: true, name: true, code: true },
        take: 5,
      }),
      canSeeEos
        ? prisma.project.findMany({
            where: { deleted: false, name: filter, ...(isMember ? memberScope : {}) },
            select: { id: true, name: true, status: true },
            take: 5,
          })
        : [],
      prisma.user.findMany({
        where: {
          active: true,
          OR: [{ name: filter }, { email: filter }],
        },
        select: { id: true, name: true, email: true, role: true },
        take: 5,
      }),
      canSeeChildren
        ? prisma.child.findMany({
            where: {
              OR: [{ firstName: filter }, { surname: filter }],
              ...(isMember ? memberScope : {}),
            },
            select: {
              id: true,
              firstName: true,
              surname: true,
              status: true,
              service: { select: { name: true } },
            },
            take: 5,
          })
        : [],
      canSeeCrm
        ? prisma.lead.findMany({
            where: { OR: [{ schoolName: filter }, { contactName: filter }] },
            select: { id: true, schoolName: true, pipelineStage: true },
            take: 5,
          })
        : [],
      canSeeCrm
        ? prisma.parentEnquiry.findMany({
            where: { OR: [{ parentName: filter }, { childName: filter }] },
            select: { id: true, parentName: true, childName: true, stage: true },
            take: 5,
          })
        : [],
    ]);

  const results = [
    ...children.map((c) => ({
      id: c.id,
      title: `${c.firstName} ${c.surname}`,
      type: "child" as const,
      subtitle: `${c.status}${c.service ? ` · ${c.service.name}` : ""}`,
    })),
    ...people.map((u) => ({
      id: u.id,
      title: u.name,
      type: "person" as const,
      // Non-admin viewers get role only — the directory masks emails
      // for them, so search shouldn't leak what the page hides.
      subtitle: isAdmin ? `${u.role} · ${u.email}` : u.role,
    })),
    ...services.map((s) => ({
      id: s.id,
      title: s.name,
      type: "service" as const,
      subtitle: s.code,
    })),
    ...leads.map((l) => ({
      id: l.id,
      title: l.schoolName,
      type: "lead" as const,
      subtitle: l.pipelineStage.replace(/_/g, " "),
    })),
    ...enquiries.map((e) => ({
      id: e.id,
      title: e.parentName,
      type: "enquiry" as const,
      subtitle: `${e.childName ?? "—"} · ${e.stage.replace(/_/g, " ")}`,
    })),
    ...rocks.map((r) => ({
      id: r.id,
      title: r.title,
      type: "rock" as const,
      subtitle: r.status,
    })),
    ...todos.map((t) => ({
      id: t.id,
      title: t.title,
      type: "todo" as const,
      subtitle: t.status,
    })),
    ...issues.map((i) => ({
      id: i.id,
      title: i.title,
      type: "issue" as const,
      subtitle: i.status,
    })),
    ...projects.map((p) => ({
      id: p.id,
      title: p.name,
      type: "project" as const,
      subtitle: p.status,
    })),
  ];

  return NextResponse.json(results);
});
