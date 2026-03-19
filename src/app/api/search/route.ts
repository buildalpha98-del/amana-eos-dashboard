import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const filter = { contains: q, mode: "insensitive" as const };

  const [rocks, todos, issues, services, projects, people] = await Promise.all([
    prisma.rock.findMany({
      where: { deleted: false, title: filter },
      select: { id: true, title: true, status: true },
      take: 5,
    }),
    prisma.todo.findMany({
      where: { deleted: false, title: filter },
      select: { id: true, title: true, status: true },
      take: 5,
    }),
    prisma.issue.findMany({
      where: { deleted: false, title: filter },
      select: { id: true, title: true, status: true },
      take: 5,
    }),
    prisma.service.findMany({
      where: { name: filter },
      select: { id: true, name: true, code: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: { deleted: false, name: filter },
      select: { id: true, name: true, status: true },
      take: 5,
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { name: filter },
          { email: filter },
        ],
      },
      select: { id: true, name: true, email: true, role: true },
      take: 5,
    }),
  ]);

  const results = [
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
    ...services.map((s) => ({
      id: s.id,
      title: s.name,
      type: "service" as const,
      subtitle: s.code,
    })),
    ...projects.map((p) => ({
      id: p.id,
      title: p.name,
      type: "project" as const,
      subtitle: p.status,
    })),
    ...people.map((u) => ({
      id: u.id,
      title: u.name,
      type: "person" as const,
      subtitle: `${u.role} · ${u.email}`,
    })),
  ];

  return NextResponse.json(results);
}
