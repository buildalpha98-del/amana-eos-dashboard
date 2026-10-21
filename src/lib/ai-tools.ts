/**
 * AI Assistant Tools — defines tools the assistant can call to query live data.
 *
 * Each tool maps to a Prisma query or internal API call.
 * The assistant uses these to look up specific data on demand rather than
 * relying solely on the pre-loaded dashboard context.
 */

import type { DocumentViewer } from "@/lib/document-visibility";
import { prisma } from "@/lib/prisma";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isAdminRole } from "@/lib/role-permissions";
import { isRole, ROLES } from "@/lib/role-enum";
import { logger } from "@/lib/logger";
import { readResponsePrefix } from "@/lib/read-response-prefix";

// ── Tool Definitions ──────────────────────────────────────────

export const ASSISTANT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "lookup_service_details",
    description:
      "Look up details for a specific Amana OSHC centre/service by name or code. Returns capacity, contact info, status, and recent metrics.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Service name or code to search for (e.g. 'Greenacre' or 'GRN')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_expiring_certificates",
    description:
      "Look up compliance certificates expiring within a given number of days. Returns certificate type, staff member, centre, and expiry date.",
    input_schema: {
      type: "object" as const,
      properties: {
        withinDays: {
          type: "number",
          description: "Number of days to look ahead (default 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "lookup_financial_period",
    description:
      "Look up financial data for a specific month and year. Returns revenue, costs, profit, and margin by centre.",
    input_schema: {
      type: "object" as const,
      properties: {
        month: {
          type: "number",
          description: "Month number (1-12)",
        },
        year: {
          type: "number",
          description: "Year (e.g. 2026)",
        },
      },
      required: ["month", "year"],
    },
  },
  {
    name: "lookup_staff_list",
    description:
      "Look up active staff members, optionally filtered by role. Returns name, role, email, and qualification summary.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          description: "Filter by role (e.g. 'staff', 'admin', 'member'). Omit for all.",
        },
      },
      required: [],
    },
  },
  {
    name: "lookup_recent_todos",
    description:
      "Look up recent to-do items, optionally filtered by status or assignee. Returns title, status, due date, and assignee.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description: "Filter by status: 'open', 'completed', 'overdue'. Omit for all open.",
        },
        limit: {
          type: "number",
          description: "Max results (default 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "lookup_enquiry_pipeline",
    description:
      "Look up the current enquiry/lead pipeline. Returns counts by stage and recent leads.",
    input_schema: {
      type: "object" as const,
      properties: {
        stage: {
          type: "string",
          description: "Filter by pipeline stage (e.g. 'new_enquiry', 'tour_booked'). Omit for all.",
        },
      },
      required: [],
    },
  },
  {
    name: "fetch_oshc_reference",
    description:
      "Fetch the text content of a page from a CURATED set of OSHC / Australian early-childhood regulatory sources when the answer isn't in the Amana knowledge base. Use AFTER search_knowledge_base returns nothing relevant — this is a fallback for industry-wide questions (NQF regulations, NQS standards, ACECQA guidance, Fair Work conditions, child safety law, etc.). " +
      "Allowed hosts: acecqa.gov.au, nqaits.acecqa.gov.au, education.gov.au, education.nsw.gov.au, education.vic.gov.au, safeworkaustralia.gov.au, fairwork.gov.au, fwc.gov.au, legislation.gov.au, ochre.nsw.gov.au, esafety.gov.au. Any other host will be rejected. " +
      "Pass a full https:// URL. If you don't know the exact URL, guess the most likely one based on the site's structure — e.g. https://www.acecqa.gov.au/nqf/national-law-regulations for NQF regs.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description:
            "Full https:// URL on an allowed host. Example: https://www.acecqa.gov.au/nqf/national-quality-standard",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Full-text search across the Amana OSHC organisational knowledge base — this is the FIRST tool you should reach for on most staff questions. The base contains: " +
      "(1) the Amana Way handbook (values, structure, how we work); " +
      "(2) the Employee Handbook (conditions, leave, pay, performance, conduct); " +
      "(3) the Proven Process (EOS-style operational playbook); " +
      "(4) operational SOPs — OWNA procedures (posting to families, daily reports, attendance), incident & injury reporting, mandatory reporting, medication, behaviour guidance, roll-call, sign-in/out, excursions, vacation care; " +
      "(5) compliance content — child protection, WHS, NQS, child-safe code of conduct, mandatory reporter training; " +
      "(6) any other text the admin has loaded into /settings/ai-knowledge. " +
      "Use it for ANY 'how do I…', 'what's our policy on…', 'where do I find…', 'what's the procedure for…' question. " +
      "Search is keyword-based (PostgreSQL tsvector): if your first query returns nothing, RETRY with different wording before assuming the content isn't there.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Keywords to search. Use 3-6 specific words from the user's question PLUS likely synonyms / OSHC terminology. Example: user asks 'how do I post to families through OWNA' → search 'OWNA family communication post parent update'. If first search returns nothing, retry with different phrasing.",
        },
      },
      required: ["query"],
    },
  },
];

// ── Tool Execution ──────────────────────────────────────────

/** The same policy governs advertising AND execution; model output is untrusted. */
export function canUseAssistantTool(name: string, viewer: DocumentViewer): boolean {
  if (!viewer?.id || !isRole(viewer.role)) return false;
  if (!ASSISTANT_TOOLS.some(tool => tool.name === name)) return false;
  return isAdminRole(viewer.role) || PUBLIC_TOOLS.has(name);
}

/** Tools every valid staff role may use: visibility-scoped search and public regulator pages. */
const PUBLIC_TOOLS = new Set(["search_knowledge_base", "fetch_oshc_reference"]);

export function getAssistantTools(viewer: DocumentViewer): Anthropic.Messages.Tool[] {
  return ASSISTANT_TOOLS.filter(tool => canUseAssistantTool(tool.name, viewer));
}

const toolInputs = {
  lookup_service_details: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
  lookup_expiring_certificates: z.object({ withinDays: z.number().int().min(0).max(366).optional() }).strict(),
  lookup_financial_period: z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2000).max(2100) }).strict(),
  lookup_staff_list: z.object({ role: z.enum(ROLES).optional() }).strict(),
  lookup_recent_todos: z.object({ status: z.enum(["open", "pending", "completed", "overdue"]).optional(), limit: z.number().int().min(1).max(50).optional() }).strict(),
  lookup_enquiry_pipeline: z.object({ stage: z.string().trim().min(1).max(80).optional() }).strict(),
  search_knowledge_base: z.object({ query: z.string().trim().min(1).max(500) }).strict(),
  fetch_oshc_reference: z.object({ url: z.string().url().max(2048) }).strict(),
};

export async function executeToolCall(
  name: string,
  input: unknown,
  /** Trusted session identity — never take this from tool arguments. */
  viewer: DocumentViewer,
): Promise<string> {
  if (!canUseAssistantTool(name, viewer)) {
    return JSON.stringify({ error: "Tool not permitted" });
  }
  try {
    // Organisation-wide lookups re-read the account rather than trusting the
    // session's role: a deactivated or demoted user's token can still be in
    // flight, and the session cache refreshes only every few minutes.
    if (!PUBLIC_TOOLS.has(name)) {
      const account = await prisma.user.findUnique({ where: { id: viewer.id }, select: { active: true, role: true } });
      if (!account?.active || !isAdminRole(account.role)) {
        return JSON.stringify({ error: "Tool not permitted" });
      }
    }
    switch (name) {
      case "lookup_service_details": {
        const data = toolInputs.lookup_service_details.parse(input);
        return await lookupServiceDetails(data.query);
      }
      case "lookup_expiring_certificates": {
        const data = toolInputs.lookup_expiring_certificates.parse(input);
        return await lookupExpiringCerts(data.withinDays);
      }
      case "lookup_financial_period": {
        const data = toolInputs.lookup_financial_period.parse(input);
        return await lookupFinancialPeriod(data.month, data.year);
      }
      case "lookup_staff_list": {
        const data = toolInputs.lookup_staff_list.parse(input);
        return await lookupStaffList(data.role);
      }
      case "lookup_recent_todos": {
        const data = toolInputs.lookup_recent_todos.parse(input);
        return await lookupRecentTodos(data.status, data.limit);
      }
      case "lookup_enquiry_pipeline": {
        const data = toolInputs.lookup_enquiry_pipeline.parse(input);
        return await lookupEnquiryPipeline(data.stage);
      }
      case "search_knowledge_base": {
        const data = toolInputs.search_knowledge_base.parse(input);
        const { searchChunks, formatChunksForPrompt } = await import(
          "@/lib/document-indexer"
        );
        const results = await searchChunks(data.query, 8, viewer);
        if (results.length === 0) {
          return JSON.stringify({
            message: "No matching documents found for this query.",
            suggestion:
              "The knowledge base may not have documents covering this topic yet.",
          });
        }
        return formatChunksForPrompt(results);
      }
      case "fetch_oshc_reference": {
        const data = toolInputs.fetch_oshc_reference.parse(input);
        return await fetchOshcReference(data.url);
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    if (err instanceof z.ZodError) return JSON.stringify({ error: "Invalid tool input" });
    // Provider-visible errors must not include database details or request data.
    logger.error("Assistant tool failed", { tool: name, userId: viewer.id });
    return JSON.stringify({ error: "Tool execution failed" });
  }
}

// ── Tool Implementations ──────────────────────────────────────

async function lookupServiceDetails(query: string): Promise<string> {
  const services = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { code: { contains: query, mode: "insensitive" } },
      ],
      status: "active",
    },
    select: {
      name: true,
      code: true,
      capacity: true,
      phone: true,
      email: true,
      address: true,
      state: true,
      status: true,
      _count: { select: { staffMembers: true } },
    },
    take: 5,
  });

  if (services.length === 0) return JSON.stringify({ message: "No matching services found" });
  return JSON.stringify(services);
}

async function lookupExpiringCerts(withinDays?: number): Promise<string> {
  const days = withinDays ?? 30;
  const cutoff = new Date(Date.now() + days * 86400000);

  const certs = await prisma.complianceCertificate.findMany({
    where: { expiryDate: { lte: cutoff } },
    include: {
      user: { select: { name: true } },
      service: { select: { name: true } },
    },
    orderBy: { expiryDate: "asc" },
    take: 50,
  });

  return JSON.stringify(
    certs
      // The AI tool surfaces expiring/expired certs to the LLM. No-expiry
      // certs aren't risk signals, so drop them entirely before the map.
      .filter((c): c is typeof c & { expiryDate: Date } => c.expiryDate !== null)
      .map((c) => ({
        type: c.type,
        staff: c.user?.name ?? "Unknown",
        // 2026-06-05: cert.service can be null (personal cert). Fall
        // back to "—" so the AI doesn't see "undefined" in the
        // structured payload.
        centre: c.service?.name ?? "—",
        expiryDate: c.expiryDate.toISOString().split("T")[0],
        daysLeft: Math.ceil((c.expiryDate.getTime() - Date.now()) / 86400000),
      })),
  );
}

async function lookupFinancialPeriod(month: number, year: number): Promise<string> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const periods = await prisma.financialPeriod.findMany({
    where: {
      periodType: "monthly",
      periodStart: { gte: start, lte: end },
    },
    include: { service: { select: { name: true } } },
  });

  if (periods.length === 0) return JSON.stringify({ message: `No financial data for ${month}/${year}` });

  const totalRev = periods.reduce((s, p) => s + p.totalRevenue, 0);
  const totalCosts = periods.reduce((s, p) => s + p.totalCosts, 0);

  return JSON.stringify({
    month,
    year,
    totalRevenue: totalRev,
    totalCosts,
    grossProfit: totalRev - totalCosts,
    margin: totalRev > 0 ? Math.round(((totalRev - totalCosts) / totalRev) * 100) : 0,
    byCentre: periods.map((p) => ({
      centre: p.service.name,
      revenue: p.totalRevenue,
      costs: p.totalCosts,
      margin: p.totalRevenue > 0 ? Math.round(((p.totalRevenue - p.totalCosts) / p.totalRevenue) * 100) : 0,
    })),
  });
}

async function lookupStaffList(role?: string): Promise<string> {
  const where: Record<string, unknown> = { active: true };
  if (role) where.role = role;

  const staff = await prisma.user.findMany({
    where,
    select: {
      name: true,
      email: true,
      role: true,
      qualifications: {
        select: { type: true, name: true },
        take: 5,
      },
    },
    take: 50,
    orderBy: { name: "asc" },
  });

  return JSON.stringify(staff);
}

async function lookupRecentTodos(status?: string, limit?: number): Promise<string> {
  const take = Math.min(limit ?? 20, 50);
  // Private todos NEVER surface in AI answers — the assistant chat is
  // open to all roles, so anything returned here is effectively public.
  // (2026-08-31, part of the isPrivate enforcement sweep.)
  const where: Record<string, unknown> = { deleted: false, isPrivate: false };

  if (status === "completed") {
    where.status = "completed";
  } else if (status === "overdue") {
    where.status = "pending";
    where.dueDate = { lt: new Date() };
  } else {
    where.status = "pending";
  }

  const todos = await prisma.todo.findMany({
    where,
    select: {
      title: true,
      status: true,
      dueDate: true,
      assignee: { select: { name: true } },
      service: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take,
  });

  return JSON.stringify(
    todos.map((t) => ({
      title: t.title,
      status: t.status,
      dueDate: t.dueDate?.toISOString().split("T")[0] ?? null,
      assignee: t.assignee?.name ?? "Unassigned",
      centre: t.service?.name ?? null,
    })),
  );
}

async function lookupEnquiryPipeline(stage?: string): Promise<string> {
  const where: Record<string, unknown> = { deleted: false };
  if (stage) where.pipelineStage = stage;

  const [leads, stageCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
      select: {
        schoolName: true,
        contactName: true,
        pipelineStage: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.lead.groupBy({
      by: ["pipelineStage"],
      where: { deleted: false },
      _count: { pipelineStage: true },
    }),
  ]);

  return JSON.stringify({
    byStage: Object.fromEntries(stageCounts.map((s) => [s.pipelineStage, s._count.pipelineStage])),
    recentLeads: leads.map((l) => ({
      school: l.schoolName,
      contact: l.contactName ?? null,
      stage: l.pipelineStage,
      date: l.createdAt.toISOString().split("T")[0],
    })),
  });
}

// ── Web fetch (allowlisted OSHC / regulator sources) ──────────
//
// The bot can call this when the internal knowledge base doesn't
// cover a question — e.g. national-law specifics, ACECQA guidance,
// Fair Work conditions. Only allowlisted hosts are accepted so the
// tool can't be used to pull in arbitrary web content.
const ALLOWED_HOSTS = new Set([
  "acecqa.gov.au",
  "www.acecqa.gov.au",
  "nqaits.acecqa.gov.au",
  "education.gov.au",
  "www.education.gov.au",
  "education.nsw.gov.au",
  "www.education.nsw.gov.au",
  "education.vic.gov.au",
  "www.education.vic.gov.au",
  "safeworkaustralia.gov.au",
  "www.safeworkaustralia.gov.au",
  "fairwork.gov.au",
  "www.fairwork.gov.au",
  "fwc.gov.au",
  "www.fwc.gov.au",
  "legislation.gov.au",
  "www.legislation.gov.au",
  "ochre.nsw.gov.au",
  "www.ochre.nsw.gov.au",
  "esafety.gov.au",
  "www.esafety.gov.au",
]);

const MAX_FETCH_BYTES = 1_500_000; // 1.5 MB
const MAX_RETURN_CHARS = 8000;

async function fetchOshcReference(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return JSON.stringify({ error: "Invalid URL" });
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return JSON.stringify({ error: "Only standard https URLs without credentials are allowed" });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return JSON.stringify({
      error: `Host '${parsed.hostname}' is not in the allowlist`,
      allowedHosts: Array.from(ALLOWED_HOSTS).filter((h) => !h.startsWith("www.")),
    });
  }

  let html: string;
  let byteLimitReached = false;
  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Amana-OSHC-Assistant/1.0" },
      redirect: "error",
      // The timeout covers response headers AND body consumption.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return JSON.stringify({ error: `Source returned ${res.status}`, url: parsed.toString() });
    }
    const bytes = await readResponsePrefix(res, MAX_FETCH_BYTES);
    byteLimitReached = bytes.byteLength === MAX_FETCH_BYTES;
    html = bytes.toString("utf8");
  } catch {
    return JSON.stringify({ error: "Source could not be fetched safely" });
  }

  // Strip script + style blocks, then collapse HTML tags to whitespace.
  // Crude but adequate for regulator pages — they're mostly text with
  // headings, lists, and tables. No need for a full DOM parser.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = byteLimitReached || text.length > MAX_RETURN_CHARS;
  return JSON.stringify({
    url: parsed.toString(),
    host: parsed.hostname,
    contentLength: text.length,
    truncated,
    content: truncated ? text.slice(0, MAX_RETURN_CHARS) + "…" : text,
  });
}
