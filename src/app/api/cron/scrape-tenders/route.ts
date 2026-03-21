import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";

/**
 * GET /api/cron/scrape-tenders
 *
 * Daily cron (11 PM UTC) — scrapes AusTender for OSHC-related tenders
 * and creates Lead records for any new results.
 *
 * Auth: Bearer CRON_SECRET
 */

const SEARCH_KEYWORDS = [
  "Outside School Hours Care",
  "OSHC",
  "before and after school care",
  "vacation care",
];

interface AusTenderResult {
  CNID: string;
  title: string;
  description?: string;
  agency?: string;
  publishDate?: string;
  closeDate?: string;
  location?: string;
  state?: string;
  category?: string;
  ATMUUID?: string;
}

async function searchAusTender(keyword: string): Promise<AusTenderResult[]> {
  try {
    // AusTender API — search current ATM (Approach to Market) notices
    const params = new URLSearchParams({
      Type: "ATM",
      SearchFrom: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
      keyword,
    });

    const url = `https://www.tenders.gov.au/Search/ExportAtmCsv?${params}`;
    const res = await fetch(url, {
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") console.log(`[TenderScraper] AusTender API returned ${res.status} for keyword "${keyword}"`);
      return [];
    }

    const text = await res.text();
    if (!text.trim()) return [];

    // Parse CSV
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length <= 1) return [];

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const results: AusTenderResult[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/("([^"]*?)"|[^,]*)/g)?.map((v) =>
        v.replace(/^"|"$/g, "").trim()
      );
      if (!values) continue;

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });

      if (row["ATM ID"] || row["CN ID"] || row["CNID"]) {
        results.push({
          CNID: row["ATM ID"] || row["CN ID"] || row["CNID"] || `unknown-${i}`,
          title: row["Title"] || row["ATM Title"] || "Untitled",
          description: row["Description"] || row["ATM Description"] || undefined,
          agency: row["Agency"] || row["Agency Name"] || undefined,
          publishDate: row["Publish Date"] || undefined,
          closeDate: row["Close Date"] || row["Close Date & Time"] || undefined,
          location: row["Location"] || undefined,
          state: row["State"] || undefined,
        });
      }
    }

    return results;
  } catch (err) {
    console.error(`[TenderScraper] Error searching "${keyword}":`, err);
    return [];
  }
}

function extractState(result: AusTenderResult): string | undefined {
  const stateMatch = (result.state || result.location || "").match(
    /\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b/i
  );
  return stateMatch ? stateMatch[1].toUpperCase() : undefined;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("scrape-tenders", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  // Create a scrape run record
  const scrapeRun = await prisma.tenderScrapeRun.create({
    data: { status: "running" },
  });

  try {
    let allResults: AusTenderResult[] = [];

    // Search each keyword
    for (const keyword of SEARCH_KEYWORDS) {
      const results = await searchAusTender(keyword);
      allResults.push(...results);
    }

    // Deduplicate by CNID
    const uniqueResults = new Map<string, AusTenderResult>();
    for (const result of allResults) {
      if (!uniqueResults.has(result.CNID)) {
        uniqueResults.set(result.CNID, result);
      }
    }

    const deduped = Array.from(uniqueResults.values());
    let leadsCreated = 0;

    for (const result of deduped) {
      // Check if a lead with this tender ref already exists
      const existing = await prisma.lead.findFirst({
        where: { tenderRef: result.CNID },
      });

      if (existing) continue;

      // Create new lead
      await prisma.lead.create({
        data: {
          schoolName: result.title.slice(0, 200),
          source: "tender",
          pipelineStage: "new_lead",
          tenderRef: result.CNID,
          tenderCloseDate: result.closeDate ? new Date(result.closeDate) : undefined,
          tenderUrl: `https://www.tenders.gov.au/Atm/Show/${result.CNID}`,
          state: extractState(result),
          notes: [
            result.description,
            result.agency ? `Agency: ${result.agency}` : null,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 5000) || undefined,
        },
      });

      leadsCreated++;
    }

    // Update scrape run
    await prisma.tenderScrapeRun.update({
      where: { id: scrapeRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        leadsFound: deduped.length,
        leadsCreated,
      },
    });

    await guard.complete({ leadsFound: deduped.length, leadsCreated });

    return NextResponse.json({
      message: "Tender scrape completed",
      leadsFound: deduped.length,
      leadsCreated,
    });
  } catch (err) {
    // Update scrape run as failed
    await prisma.tenderScrapeRun.update({
      where: { id: scrapeRun.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });

    await guard.fail(err);
    console.error("[TenderScraper] Cron failed:", err);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
