import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";
import { resolveServiceByCode } from "../../_lib/resolve-service";

const AUDIENCES = ["all", "owners_admins", "managers", "custom"] as const;
const PRIORITIES = ["normal", "important", "urgent"] as const;

const apiAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Body is required"),
  audience: z.enum([...AUDIENCES]).default("all"),
  priority: z.enum([...PRIORITIES]).default("normal"),
  pinned: z.boolean().default(false),
  serviceCode: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
});

// POST /api/cowork/v2/announcements — Create announcement in the real Announcement model
export async function POST(req: NextRequest) {
  // 1. Authenticate
  const { apiKey, error: authError } = await authenticateApiKey(req, "announcements:write");
  if (authError) return authError;

  // 2. Rate limit
  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json(
      { error: "Too Many Requests", message: "Rate limit exceeded (100 req/min)" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetIn / 1000)) } },
    );
  }

  try {
    // 3. Validate body
    const body = await req.json();
    const parsed = apiAnnouncementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { title, body: announcementBody, audience, priority, pinned, serviceCode, publishedAt } =
      parsed.data;

    // 4. Resolve service code if provided
    let serviceId: string | null = null;
    if (serviceCode) {
      const service = await resolveServiceByCode(serviceCode);
      if (!service) {
        return NextResponse.json(
          { error: "Not Found", message: `Service with code "${serviceCode}" not found` },
          { status: 404 },
        );
      }
      serviceId = service.id;
    }

    // 5. Create announcement
    const announcement = await prisma.announcement.create({
      data: {
        title,
        body: announcementBody,
        audience,
        priority,
        pinned,
        serviceId,
        authorId: apiKey!.createdById,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        service: { select: { id: true, name: true } },
      },
    });

    // 6. Activity log
    await prisma.activityLog.create({
      data: {
        userId: apiKey!.createdById,
        action: "api_import",
        entityType: "Announcement",
        entityId: announcement.id,
        details: {
          title,
          audience,
          priority,
          serviceCode: serviceCode || null,
          via: "api_key",
          keyName: apiKey!.name,
        },
      },
    });

    return NextResponse.json(announcement, { status: 201 });
  } catch (err) {
    console.error("[Cowork V2 Announcements POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
