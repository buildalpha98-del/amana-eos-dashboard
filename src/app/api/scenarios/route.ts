import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
/**
 * GET /api/scenarios — list saved scenarios for the current user
 */
export const GET = withApiAuth(async (req, session) => {
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
});

const scenarioBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  inputs: z.record(z.string(), z.any()),
  outputs: z.record(z.string(), z.any()),
});

/**
 * POST /api/scenarios — save a scenario
 * Body: { name, description?, inputs, outputs }
 */
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = scenarioBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, description, inputs, outputs } = parsed.data;

  const scenario = await prisma.scenario.create({
    data: {
      name,
      description: description || null,
      inputs,
      outputs,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(scenario, { status: 201 });
});
