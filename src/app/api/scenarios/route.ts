import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/scenarios — list saved scenarios for the current user
 */
export async function GET() {
  const { session, error } = await requireAuth();
  if (error || !session) return error;

  const scenarios = await prisma.scenario.findMany({
    where: { createdById: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      inputs: true,
      outputs: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(scenarios);
}

/**
 * POST /api/scenarios — save a scenario
 * Body: { name, description?, inputs, outputs }
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error;

  const body = await req.json();
  const { name, description, inputs, outputs } = body as {
    name?: string;
    description?: string;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  };

  if (!name || !inputs || !outputs) {
    return NextResponse.json(
      { error: "name, inputs, and outputs are required" },
      { status: 400 },
    );
  }

  const scenario = await prisma.scenario.create({
    data: {
      name,
      description: description || null,
      inputs: inputs as Prisma.InputJsonValue,
      outputs: outputs as Prisma.InputJsonValue,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(scenario, { status: 201 });
}
