import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const anomaly = await prisma.attendanceAnomaly.update({
    where: { id },
    data: { dismissed: body.dismissed ?? true },
  });

  return NextResponse.json(anomaly);
}
