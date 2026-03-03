import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import * as XLSX from "xlsx";
import type { MarketingPlatform, MarketingPostStatus } from "@prisma/client";

// ── Column-name normalisation ──────────────────────────────
// Claude AI calendars can use various column names.  We map them
// to a canonical set so users don't have to worry about exact headers.

const COLUMN_ALIASES: Record<string, string> = {
  // Date
  date: "date",
  "scheduled date": "date",
  "post date": "date",
  "publish date": "date",
  scheduleddate: "date",

  // Platform
  platform: "platform",
  channel: "platform",
  network: "platform",
  "social media": "platform",

  // Content
  content: "content",
  caption: "content",
  copy: "content",
  text: "content",
  body: "content",
  "post content": "content",
  "post copy": "content",

  // Title
  title: "title",
  subject: "title",
  heading: "title",
  "post title": "title",

  // Hashtags
  hashtags: "hashtags",
  tags: "hashtags",
  "hash tags": "hashtags",

  // Campaign
  campaign: "campaign",
  "campaign name": "campaign",

  // Status
  status: "status",
  "post status": "status",

  // Post type / pillar
  "post type": "pillar",
  type: "pillar",
  pillar: "pillar",
  "content pillar": "pillar",
  category: "pillar",

  // Media / design link
  "media url": "designLink",
  media: "designLink",
  "design link": "designLink",
  "image url": "designLink",
  image: "designLink",
  url: "designLink",
  link: "designLink",

  // Notes
  notes: "notes",
  note: "notes",
  "internal notes": "notes",
};

// ── Platform normalisation ─────────────────────────────────

const PLATFORM_MAP: Record<string, MarketingPlatform> = {
  facebook: "facebook",
  fb: "facebook",
  instagram: "instagram",
  ig: "instagram",
  insta: "instagram",
  linkedin: "linkedin",
  li: "linkedin",
  email: "email",
  newsletter: "newsletter",
  website: "website",
  web: "website",
  blog: "website",
  flyer: "flyer",
};

function normalisePlatform(raw: string): MarketingPlatform | null {
  const key = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  return PLATFORM_MAP[key] ?? null;
}

// ── Status normalisation ───────────────────────────────────

const STATUS_MAP: Record<string, MarketingPostStatus> = {
  draft: "draft",
  "in review": "in_review",
  in_review: "in_review",
  review: "in_review",
  approved: "approved",
  scheduled: "scheduled",
  published: "published",
  live: "published",
  posted: "published",
};

function normaliseStatus(raw: string): MarketingPostStatus {
  const key = raw.trim().toLowerCase();
  return STATUS_MAP[key] ?? "draft";
}

// ── Date parsing ───────────────────────────────────────────

function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // XLSX serial date number
  if (typeof raw === "number") {
    // Excel epoch: 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = raw * 86400000;
    const d = new Date(excelEpoch.getTime() + ms);
    if (!isNaN(d.getTime())) return d;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Try direct Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // Try DD/MM/YYYY or DD-MM-YYYY common in AU
  const auMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (auMatch) {
    const day = parseInt(auMatch[1]);
    const month = parseInt(auMatch[2]) - 1;
    let year = parseInt(auMatch[3]);
    if (year < 100) year += 2000;
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

// ── Preview endpoint (dry-run) ─────────────────────────────
// POST with ?preview=true returns parsed rows without creating records.

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const isPreview = searchParams.get("preview") === "true";

  // ── Parse the uploaded file ───────────────────────────────

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  const allowedTypes = [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/csv",
  ];
  const fileName = file.name.toLowerCase();
  const isAllowed =
    allowedTypes.includes(file.type) ||
    fileName.endsWith(".csv") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls");

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Only CSV and Excel files are supported (.csv, .xlsx, .xls)" },
      { status: 400 }
    );
  }

  let rows: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse file. Ensure it is a valid CSV or Excel file." },
      { status: 400 }
    );
  }

  if (!rows.length) {
    return NextResponse.json(
      { error: "File contains no data rows." },
      { status: 400 }
    );
  }

  // ── Normalise column names ────────────────────────────────

  const normalisedRows = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const canonical = COLUMN_ALIASES[key.trim().toLowerCase()];
      if (canonical) {
        out[canonical] = String(value ?? "").trim();
      }
    }
    return out;
  });

  // ── Build parsed posts ────────────────────────────────────

  interface ParsedPost {
    rowIndex: number;
    title: string;
    platform: MarketingPlatform;
    platformRaw: string;
    status: MarketingPostStatus;
    scheduledDate: string | null;
    content: string | null;
    hashtags: string | null;
    campaign: string | null;
    pillar: string | null;
    designLink: string | null;
    notes: string | null;
    error: string | null;
  }

  const parsed: ParsedPost[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < normalisedRows.length; i++) {
    const r = normalisedRows[i];

    // Skip completely empty rows
    const hasData = Object.values(r).some((v) => v.trim() !== "");
    if (!hasData) continue;

    // Platform is required
    const platformRaw = r.platform || "";
    const platform = normalisePlatform(platformRaw);
    if (!platform) {
      errors.push({
        row: i + 2, // +2: 1-indexed + header row
        message: platformRaw
          ? `Unknown platform "${platformRaw}"`
          : "Missing platform",
      });
      continue;
    }

    // Build title: use explicit title column, or derive from content
    let title = r.title || "";
    if (!title && r.content) {
      title =
        r.content.length > 60
          ? r.content.substring(0, 57) + "..."
          : r.content;
    }
    if (!title) {
      title = `${platformRaw} post`;
    }

    // Append hashtags to content/notes if provided
    let content = r.content || null;
    const hashtags = r.hashtags || null;
    if (hashtags && content) {
      content = `${content}\n\n${hashtags}`;
    } else if (hashtags && !content) {
      content = hashtags;
    }

    const scheduledDate = parseDate(r.date);
    const status = r.status ? normaliseStatus(r.status) : "scheduled";

    parsed.push({
      rowIndex: i + 2,
      title,
      platform,
      platformRaw,
      status: scheduledDate ? status : "draft",
      scheduledDate: scheduledDate ? scheduledDate.toISOString() : null,
      content,
      hashtags,
      campaign: r.campaign || null,
      pillar: r.pillar || null,
      designLink: r.designLink || null,
      notes: r.notes || null,
      error: null,
    });
  }

  // ── Preview mode: return parsed data for user review ──────

  if (isPreview) {
    // Collect unique campaign names
    const campaignNames = [
      ...new Set(
        parsed
          .map((p) => p.campaign)
          .filter((c): c is string => !!c)
      ),
    ];

    return NextResponse.json({
      posts: parsed,
      errors,
      summary: {
        totalRows: rows.length,
        validPosts: parsed.length,
        errorCount: errors.length,
        campaigns: campaignNames,
      },
    });
  }

  // ── Import mode: create records ───────────────────────────

  if (parsed.length === 0) {
    return NextResponse.json(
      {
        error: "No valid posts to import.",
        errors,
      },
      { status: 400 }
    );
  }

  // Resolve or create campaigns
  const campaignIdMap = new Map<string, string>();
  const uniqueCampaigns = [
    ...new Set(
      parsed
        .map((p) => p.campaign)
        .filter((c): c is string => !!c)
    ),
  ];

  for (const name of uniqueCampaigns) {
    // Try to find existing campaign by name (case-insensitive)
    let campaign = await prisma.marketingCampaign.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        deleted: false,
      },
    });

    if (!campaign) {
      // Compute date range from posts in this campaign
      const campaignPosts = parsed.filter(
        (p) => p.campaign?.toLowerCase() === name.toLowerCase()
      );
      const dates = campaignPosts
        .map((p) => (p.scheduledDate ? new Date(p.scheduledDate) : null))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      const platforms = [
        ...new Set(campaignPosts.map((p) => p.platform)),
      ] as MarketingPlatform[];

      campaign = await prisma.marketingCampaign.create({
        data: {
          name,
          type: "campaign",
          status: "scheduled",
          startDate: dates.length > 0 ? dates[0] : null,
          endDate: dates.length > 1 ? dates[dates.length - 1] : null,
          platforms,
        },
      });
    }

    campaignIdMap.set(name.toLowerCase(), campaign.id);
  }

  // Create all posts
  let createdCount = 0;
  const createdPosts: { id: string; title: string; platform: string }[] = [];

  for (const p of parsed) {
    const campaignId = p.campaign
      ? campaignIdMap.get(p.campaign.toLowerCase()) ?? null
      : null;

    const post = await prisma.marketingPost.create({
      data: {
        title: p.title,
        platform: p.platform,
        status: p.status,
        scheduledDate: p.scheduledDate ? new Date(p.scheduledDate) : null,
        content: p.content,
        notes: p.notes,
        designLink: p.designLink,
        pillar: p.pillar,
        campaignId,
      },
    });

    createdPosts.push({
      id: post.id,
      title: post.title,
      platform: post.platform,
    });
    createdCount++;
  }

  // Log activity
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "import",
      entityType: "MarketingPost",
      entityId: "bulk-import",
      details: {
        postsCreated: createdCount,
        campaignsCreated: uniqueCampaigns.length,
        fileName: file.name,
      },
    },
  });

  return NextResponse.json({
    success: true,
    summary: {
      postsCreated: createdCount,
      campaignsCreated: uniqueCampaigns.filter(
        (name) => !campaignIdMap.has(name.toLowerCase())
      ).length,
      campaignsMatched: uniqueCampaigns.length,
      errors: errors.length,
    },
    posts: createdPosts,
    errors,
  });
}
