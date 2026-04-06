import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { uploadFile } from "@/lib/storage/uploadFile";
import { z } from "zod";

const createPickupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  phone: z.string().min(1, "Phone number is required"),
  photoId: z.string().nullable().optional(),
  isEmergencyContact: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  const pickups = await prisma.authorisedPickup.findMany({
    where: { childId: id, active: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ pickups });
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  const contentType = req.headers.get("content-type") || "";

  let data: z.infer<typeof createPickupSchema>;
  let photo: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    data = createPickupSchema.parse({
      name: formData.get("name"),
      relationship: formData.get("relationship"),
      phone: formData.get("phone") || "",
      photoId: (formData.get("photoId") as string) || undefined,
      isEmergencyContact: formData.get("isEmergencyContact") === "true",
      notes: (formData.get("notes") as string) || undefined,
    });
    photo = formData.get("photo") as File | null;
  } else {
    const body = await parseJsonBody(req);
    const parsed = createPickupSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
    }
    data = parsed.data;
  }

  let photoUrl: string | undefined;
  if (photo && photo.size > 0) {
    if (photo.size > 5 * 1024 * 1024) {
      throw ApiError.badRequest("Photo exceeds 5MB limit");
    }
    const tempId = Math.random().toString(36).slice(2, 10);
    photoUrl = await uploadFile(photo, `pickups/${id}/${tempId}.jpg`, photo.type);
  }

  const pickup = await prisma.authorisedPickup.create({
    data: {
      childId: id,
      name: data.name,
      relationship: data.relationship,
      phone: data.phone,
      photoId: data.photoId ?? undefined,
      isEmergencyContact: data.isEmergencyContact ?? false,
      notes: data.notes,
      photoUrl,
    },
  });

  return NextResponse.json(pickup, { status: 201 });
});
