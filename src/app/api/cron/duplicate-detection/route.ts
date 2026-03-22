import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/duplicate-detection
 *
 * Weekly cron — scans leads and parent enquiries for potential duplicates
 * using AI-powered fuzzy matching on names, emails, and phone numbers.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("duplicate-detection", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const ai = getAI();
    if (!ai) {
      await guard.fail("AI not configured");
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    // Gather active leads
    const leads = await prisma.lead.findMany({
      where: { deleted: false },
      select: {
        id: true,
        schoolName: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        suburb: true,
        state: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Gather active parent enquiries
    const enquiries = await prisma.parentEnquiry.findMany({
      where: { deleted: false },
      select: {
        id: true,
        parentName: true,
        parentEmail: true,
        parentPhone: true,
        childName: true,
        serviceId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (leads.length < 2 && enquiries.length < 2) {
      await guard.complete({ message: "Not enough records to check" });
      return NextResponse.json({ success: true, message: "Not enough records" });
    }

    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "duplicates/detection-report" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const leadsText =
      leads
        .map(
          (l) =>
            `ID:${l.id} | School: ${l.schoolName ?? ""} | Contact: ${l.contactName ?? ""} | Email: ${l.contactEmail ?? ""} | Phone: ${l.contactPhone ?? ""} | ${l.suburb ?? ""}, ${l.state ?? ""}`,
        )
        .join("\n") || "No leads.";

    const enquiriesText =
      enquiries
        .map(
          (e) =>
            `ID:${e.id} | Parent: ${e.parentName ?? ""} | Email: ${e.parentEmail ?? ""} | Phone: ${e.parentPhone ?? ""} | Child: ${e.childName ?? ""}`,
        )
        .join("\n") || "No enquiries.";

    let prompt = template.promptTemplate;
    prompt = prompt.replaceAll("{{leads}}", leadsText);
    prompt = prompt.replaceAll("{{enquiries}}", enquiriesText);

    const startMs = Date.now();
    const response = await ai.messages.create({
      model: template.model,
      max_tokens: template.maxTokens,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const durationMs = Date.now() - startMs;

    let parsed: {
      duplicates?: Array<{
        entityType: string;
        entityAId: string;
        entityBId: string;
        similarity: number;
        matchFields: string[];
        reason: string;
      }>;
      summary?: string;
    } = { duplicates: [] };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { duplicates: [], summary: text };
    }

    // Save duplicate matches
    let savedCount = 0;
    if (parsed.duplicates && parsed.duplicates.length > 0) {
      for (const d of parsed.duplicates) {
        // Ensure consistent ordering (A < B) to avoid duplicate pairs
        const [entityAId, entityBId] = [d.entityAId, d.entityBId].sort();
        try {
          await prisma.duplicateMatch.upsert({
            where: {
              entityType_entityAId_entityBId: {
                entityType: d.entityType,
                entityAId,
                entityBId,
              },
            },
            update: { similarity: d.similarity, matchFields: d.matchFields },
            create: {
              entityType: d.entityType,
              entityAId,
              entityBId,
              similarity: d.similarity,
              matchFields: d.matchFields,
            },
          });
          savedCount++;
        } catch {
          // Skip invalid IDs
        }
      }
    }

    // Create CoworkReport if duplicates found
    if (savedCount > 0) {
      const adminUser = await prisma.user.findFirst({
        where: { role: { in: ["owner", "admin"] }, active: true },
        select: { id: true },
      });

      const duplicatesList = (parsed.duplicates ?? [])
        .map(
          (d) =>
            `- **${d.entityType}**: ${d.reason} (${d.similarity}% match on ${d.matchFields.join(", ")})`,
        )
        .join("\n");

      await prisma.coworkReport.create({
        data: {
          seat: "operations",
          reportType: "duplicate-detection",
          title: `Duplicate Records Report — ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
          content: `## Potential Duplicates Found\n\n${duplicatesList}\n\n---\n\n${parsed.summary ?? `${savedCount} potential duplicate pairs detected.`}\n\nReview and merge or dismiss from the Enquiries page.`,
          metrics: {
            duplicatesFound: savedCount,
            leadsScanned: leads.length,
            enquiriesScanned: enquiries.length,
          },
          alerts: [{ level: "info", message: `${savedCount} potential duplicate record(s) to review` }],
          assignedToId: adminUser?.id,
        },
      });
    }

    // Log AI usage
    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { id: true },
    });
    if (adminUser) {
      await prisma.aiUsage.create({
        data: {
          userId: adminUser.id,
          templateSlug: "duplicates/detection-report",
          model: template.model,
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          durationMs,
          section: "duplicates",
        },
      });
    }

    await guard.complete({
      duplicatesFound: savedCount,
      leadsScanned: leads.length,
      enquiriesScanned: enquiries.length,
    });

    return NextResponse.json({ success: true, duplicatesFound: savedCount });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to run duplicate detection" }, { status: 500 });
  }
});
