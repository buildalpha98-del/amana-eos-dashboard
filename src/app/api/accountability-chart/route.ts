import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// ---------- Helpers ----------

interface SeatRow {
  id: string;
  title: string;
  responsibilities: string[];
  parentId: string | null;
  order: number;
  assignees: {
    user: { id: string; name: string; avatar: string | null };
  }[];
}

interface SeatNode {
  id: string;
  title: string;
  responsibilities: string[];
  parentId: string | null;
  order: number;
  assignees: { id: string; name: string; avatar: string | null }[];
  children: SeatNode[];
}

function buildTree(rows: SeatRow[]): SeatNode[] {
  const map = new Map<string, SeatNode>();
  const roots: SeatNode[] = [];

  // Create nodes
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      title: r.title,
      responsibilities: r.responsibilities,
      parentId: r.parentId,
      order: r.order,
      assignees: r.assignees.map((a) => a.user),
      children: [],
    });
  }

  // Wire parent → children
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by order at every level
  const sortChildren = (nodes: SeatNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

// ---------- GET /api/accountability-chart ----------

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const rows = await prisma.accountabilitySeat.findMany({
    include: {
      assignees: {
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(buildTree(rows));
}

// ---------- POST /api/accountability-chart ----------

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const { title, responsibilities = [], parentId = null, order = 0, assigneeIds = [] } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const seat = await prisma.accountabilitySeat.create({
    data: {
      title: title.trim(),
      responsibilities,
      parentId,
      order,
      assignees: {
        create: (assigneeIds as string[]).map((userId: string) => ({ userId })),
      },
    },
    include: {
      assignees: {
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  });

  return NextResponse.json(seat, { status: 201 });
}
