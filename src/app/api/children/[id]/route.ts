import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const child = await prisma.child.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      enrolment: {
        select: {
          id: true,
          token: true,
          primaryParent: true,
          secondaryParent: true,
          emergencyContacts: true,
          authorisedPickup: true,
          consents: true,
          paymentMethod: true,
          paymentDetails: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(child);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();

  const allowedFields = ["status", "serviceId", "schoolName", "yearLevel"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  for (const key of allowedFields) {
    if (key in body) updateData[key] = body[key];
  }

  const updated = await prisma.child.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}
