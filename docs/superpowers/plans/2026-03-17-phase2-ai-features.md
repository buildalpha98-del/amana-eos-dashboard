# Phase 2 AI Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 5 Phase 2 AI features (sentiment scoring, campaign briefs, attendance anomaly detection, duplicate detection, resume screening) plus resume file upload infrastructure.

**Architecture:** Infrastructure-first approach — single schema push with all new models/fields, seed all 5 AI templates at once, register all 3 crons, then wire up each feature's UI. All features use the existing shared AI infrastructure (AiButton, useAiGenerate, /api/ai/generate, AiPromptTemplate + AiUsage).

**Tech Stack:** Next.js 16, Prisma 5.22, PostgreSQL (Railway), Anthropic Claude API, Vercel Blob (file uploads), React Query, Tailwind CSS.

---

## Chunk 1: Schema + Templates + Seed (Infrastructure)

### Task 1: Prisma Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add RecruitmentCandidate resume fields**

At the end of the `RecruitmentCandidate` model (after `notes` field, before `createdAt`), add:

```prisma
  resumeText       String?  @db.Text
  resumeFileUrl    String?
  aiScreenScore    Int?     // 0-100 fit score
  aiScreenSummary  String?  @db.Text
```

- [ ] **Step 2: Add SentimentScore model**

Append after the `AiUsage` model:

```prisma
model SentimentScore {
  id         String   @id @default(cuid())
  sourceType String   // "nps", "quick_feedback", "exit_survey"
  sourceId   String
  serviceId  String?
  service    Service? @relation("SentimentScoreService", fields: [serviceId], references: [id], onDelete: SetNull)
  score      Float    // -1.0 to 1.0
  label      String   // "positive", "neutral", "negative"
  keywords   String[]
  summary    String?
  createdAt  DateTime @default(now())

  @@unique([sourceType, sourceId])
  @@index([serviceId])
  @@index([label])
  @@index([createdAt])
}
```

Add to the Service model relations: `sentimentScores SentimentScore[] @relation("SentimentScoreService")`

- [ ] **Step 3: Add AttendanceAnomaly model**

```prisma
model AttendanceAnomaly {
  id          String   @id @default(cuid())
  serviceId   String
  service     Service  @relation("AttendanceAnomalyService", fields: [serviceId], references: [id], onDelete: Cascade)
  date        DateTime @db.Date
  sessionType String   // "bsc", "asc", "vc"
  anomalyType String   // "drop", "spike", "zero", "capacity_exceeded", "trend_decline"
  severity    String   // "low", "medium", "high"
  message     String
  expected    Float?   // expected attendance count
  actual      Float?   // actual attendance count
  dismissed   Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([serviceId])
  @@index([date])
  @@index([severity])
  @@index([dismissed])
  @@index([createdAt])
}
```

Add to the Service model relations: `attendanceAnomalies AttendanceAnomaly[] @relation("AttendanceAnomalyService")`

- [ ] **Step 4: Add DuplicateMatch model**

```prisma
model DuplicateMatch {
  id          String   @id @default(cuid())
  entityType  String   // "lead", "enquiry", "contact"
  entityAId   String
  entityBId   String
  similarity  Int      // 0-100
  matchFields String[] // ["email", "phone", "name"]
  status      String   @default("pending") // "pending", "merged", "dismissed"
  createdAt   DateTime @default(now())

  @@unique([entityType, entityAId, entityBId])
  @@index([entityType])
  @@index([status])
  @@index([createdAt])
}
```

- [ ] **Step 5: Push schema to both databases**

```bash
npx prisma db push
export DATABASE_URL=$(grep "^DATABASE_URL" .env.local | cut -d'"' -f2) && npx prisma db push
```

Expected: Both local and Railway DBs updated with new models/fields.

- [ ] **Step 6: Verify build still passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: `Compiled successfully`

- [ ] **Step 7: Commit schema changes**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Phase 2 AI schema — SentimentScore, AttendanceAnomaly, DuplicateMatch, resume fields"
```

---

### Task 2: Seed AI Prompt Templates

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add 5 new templates to the aiTemplates array in seed.ts**

Add these entries to the `aiTemplates` array (before the closing `];`):

```typescript
    {
      slug: "sentiment/weekly-analysis",
      name: "Weekly Sentiment Analysis",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["npsResponses", "quickFeedback", "period", "serviceNames"]),
      promptTemplate: `Analyse parent sentiment for Amana OSHC centres this week.

Period: {{period}}
Centres: {{serviceNames}}

NPS Responses:
{{npsResponses}}

Quick Feedback:
{{quickFeedback}}

For each response, determine:
- Sentiment score (-1.0 to 1.0 where -1 is very negative, 0 is neutral, 1 is very positive)
- Label: "positive", "neutral", or "negative"
- Keywords: 2-4 key themes from the comment

Then write a summary covering:
1. **Overall Sentiment** — 2-sentence summary with average score
2. **Key Themes** — most common positive and negative themes
3. **Centres of Concern** — any centre with consistently negative feedback
4. **Bright Spots** — centres receiving praise
5. **Recommended Actions** — 3-5 specific follow-ups

Return as JSON:
{
  "scores": [{ "sourceType": "nps"|"quick_feedback", "sourceId": "...", "score": 0.8, "label": "positive", "keywords": ["staff", "activities"], "summary": "..." }],
  "reportMarkdown": "..."
}`,
    },
    {
      slug: "marketing/campaign-brief",
      name: "Campaign Strategy Brief",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1500,
      variables: JSON.stringify(["campaignName", "campaignType", "goal", "platforms", "startDate", "endDate", "targetCentres", "existingNotes"]),
      promptTemplate: `Generate a marketing campaign strategy brief for Amana OSHC.

Campaign: {{campaignName}}
Type: {{campaignType}}
Goal: {{goal}}
Platforms: {{platforms}}
Dates: {{startDate}} to {{endDate}}
Target centres: {{targetCentres}}
Existing notes: {{existingNotes}}

Write a comprehensive campaign brief covering:

## Campaign Overview
1-2 paragraph summary of the campaign strategy.

## Target Audience
Who this campaign reaches and key messaging angles.

## Content Strategy
- Content pillars to focus on
- Suggested post types per platform
- Tone and voice guidelines

## Timeline & Milestones
Week-by-week breakdown of key activities.

## KPI Targets
Platform-specific targets (reach, engagement, conversions).

## Activation Ideas
3-5 creative ideas for centre-level activation.

## Budget Allocation
Suggested split across channels (if budget is provided).

Keep it actionable and specific to OSHC marketing. Reference Amana's brand values.`,
    },
    {
      slug: "attendance/anomaly-detection",
      name: "Attendance Anomaly Detector",
      model: "claude-haiku-3-5-20241022",
      maxTokens: 512,
      variables: JSON.stringify(["serviceName", "weekData", "historicalAverage", "capacity"]),
      promptTemplate: `Detect attendance anomalies for {{serviceName}}.

Current week data (day | session | enrolled | attended | capacity):
{{weekData}}

13-week rolling average (session | avgEnrolled | avgAttended):
{{historicalAverage}}

Centre capacity: {{capacity}}

Analyse for anomalies:
- Attendance drops >20% from 13-week average
- Capacity exceeded (attended > capacity)
- Zero attendance on normally-active sessions
- Consistent declining trend over 3+ weeks
- Unusual casual-to-enrolled ratios

Return ONLY valid JSON (no markdown):
{
  "anomalies": [
    {
      "day": "Monday",
      "sessionType": "bsc",
      "type": "drop",
      "severity": "high",
      "message": "BSC attendance dropped 35% vs 13-week average (12 vs avg 18.5)",
      "expected": 18.5,
      "actual": 12
    }
  ],
  "summary": "1-2 sentence overall assessment"
}

If no anomalies detected, return: { "anomalies": [], "summary": "No anomalies detected." }`,
    },
    {
      slug: "duplicates/detection-report",
      name: "Duplicate Record Detector",
      model: "claude-haiku-3-5-20241022",
      maxTokens: 512,
      variables: JSON.stringify(["leads", "enquiries"]),
      promptTemplate: `Detect potential duplicate records in Amana OSHC's CRM data.

Leads (B2B school partnerships):
{{leads}}

Parent Enquiries (B2C):
{{enquiries}}

Find potential duplicates by matching:
- Exact or near-exact email addresses
- Similar names (accounting for typos, abbreviations)
- Matching phone numbers (ignore formatting)
- Same school/organisation name with slight variations

Return ONLY valid JSON (no markdown):
{
  "duplicates": [
    {
      "entityType": "lead",
      "entityAId": "...",
      "entityBId": "...",
      "similarity": 92,
      "matchFields": ["email", "schoolName"],
      "reason": "Same email, school name differs by 1 character"
    }
  ],
  "summary": "Found X potential duplicate pairs across Y records."
}

Only flag pairs with >80% similarity. If no duplicates found, return empty array.`,
    },
    {
      slug: "recruitment/resume-screen",
      name: "Resume Screening & Fit Scoring",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["vacancyRole", "vacancyQualification", "vacancyNotes", "serviceName", "candidates"]),
      promptTemplate: `Screen candidates for an Amana OSHC recruitment vacancy.

Vacancy: {{vacancyRole}} at {{serviceName}}
Required qualification: {{vacancyQualification}}
Vacancy notes: {{vacancyNotes}}

Candidates:
{{candidates}}

For each candidate, evaluate:
1. **Qualification match** — Does their resume/notes indicate they hold the required qualification?
2. **Experience relevance** — OSHC, childcare, education, or related experience
3. **Cultural fit** — Community involvement, values alignment with Amana OSHC
4. **Red flags** — Gaps, inconsistencies, or concerns

Return ONLY valid JSON (no markdown):
{
  "screenings": [
    {
      "candidateId": "...",
      "fitScore": 82,
      "strengths": ["5 years OSHC experience", "Diploma qualified"],
      "gaps": ["No first aid certificate mentioned"],
      "recommendation": "SCREEN — Strong candidate, verify first aid status",
      "priority": "high"
    }
  ],
  "summary": "Screened X candidates. Y recommended for interview."
}

Priority levels: "high" (score 75+), "medium" (50-74), "low" (below 50).`,
    },
```

- [ ] **Step 2: Run seed against production DB**

```bash
export DATABASE_URL=$(grep "^DATABASE_URL" .env.local | cut -d'"' -f2) && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// [paste the 5 templates as a standalone seed script, same upsert pattern as Phase 1]
"
```

- [ ] **Step 3: Commit seed changes**

```bash
git add prisma/seed.ts
git commit -m "feat: add 5 Phase 2 AI prompt templates to seed"
```

---

### Task 3: Register Cron Jobs in vercel.json

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add 3 new cron entries**

Add to the `crons` array:

```json
{
  "path": "/api/cron/sentiment-analysis",
  "schedule": "0 7 * * 1"
},
{
  "path": "/api/cron/attendance-anomaly",
  "schedule": "0 9 * * *"
},
{
  "path": "/api/cron/duplicate-detection",
  "schedule": "0 8 * * 1"
}
```

Schedules (UTC → AEST):
- Sentiment: Mondays 7AM UTC (5PM AEST) — weekly after feedback collected
- Attendance anomaly: Daily 9AM UTC (7PM AEST) — after centres close
- Duplicate detection: Mondays 8AM UTC (6PM AEST) — weekly housekeeping

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: register Phase 2 cron schedules — sentiment, attendance, duplicates"
```

---

## Chunk 2: Cron Routes (3 Backend Features)

### Task 4: Sentiment Analysis Cron

**Files:**
- Create: `src/app/api/cron/sentiment-analysis/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("sentiment-analysis", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const ai = getAI();
    if (!ai) {
      await guard.fail("AI not configured");
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // Gather NPS responses from past week
    const npsResponses = await prisma.npsSurveyResponse.findMany({
      where: { createdAt: { gte: weekAgo } },
      include: { service: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Gather QuickFeedback from past week
    const quickFeedback = await prisma.quickFeedback.findMany({
      where: { createdAt: { gte: weekAgo } },
      include: { service: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (npsResponses.length === 0 && quickFeedback.length === 0) {
      await guard.complete({ message: "No feedback to analyse" });
      return NextResponse.json({ success: true, message: "No feedback this week" });
    }

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { name: true },
    });

    const npsText = npsResponses.map((r) =>
      `- [${r.category}] Score: ${r.score}/10 | Centre: ${r.service?.name ?? "Unknown"} | Comment: "${r.comment ?? "No comment"}" | ID: ${r.id}`
    ).join("\n") || "No NPS responses this week.";

    const feedbackText = quickFeedback.map((f) =>
      `- Score: ${f.score}/5 | Centre: ${f.service?.name ?? "Unknown"} | Comment: "${f.comment ?? "No comment"}" | ID: ${f.id}`
    ).join("\n") || "No quick feedback this week.";

    // Load template
    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "sentiment/weekly-analysis" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let prompt = template.promptTemplate;
    prompt = prompt.replaceAll("{{npsResponses}}", npsText);
    prompt = prompt.replaceAll("{{quickFeedback}}", feedbackText);
    prompt = prompt.replaceAll("{{period}}", `${weekAgo.toLocaleDateString("en-AU")} — ${now.toLocaleDateString("en-AU")}`);
    prompt = prompt.replaceAll("{{serviceNames}}", services.map((s) => s.name).join(", "));

    const startMs = Date.now();
    const response = await ai.messages.create({
      model: template.model,
      max_tokens: template.maxTokens,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const firstBlock = response.content[0];
    const text = firstBlock.type === "text" ? firstBlock.text : "";
    const durationMs = Date.now() - startMs;

    // Parse AI response
    let parsed: { scores?: Array<{ sourceType: string; sourceId: string; score: number; label: string; keywords: string[]; summary: string }>; reportMarkdown?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // If JSON parsing fails, use raw text as report
      parsed = { reportMarkdown: text, scores: [] };
    }

    // Save individual sentiment scores
    if (parsed.scores && Array.isArray(parsed.scores)) {
      for (const s of parsed.scores) {
        const npsMatch = npsResponses.find((r) => r.id === s.sourceId);
        const feedbackMatch = quickFeedback.find((f) => f.id === s.sourceId);
        const serviceId = npsMatch?.serviceId ?? feedbackMatch?.serviceId ?? null;

        await prisma.sentimentScore.upsert({
          where: {
            sourceType_sourceId: {
              sourceType: s.sourceType,
              sourceId: s.sourceId,
            },
          },
          update: {
            score: s.score,
            label: s.label,
            keywords: s.keywords,
            summary: s.summary,
            serviceId,
          },
          create: {
            sourceType: s.sourceType,
            sourceId: s.sourceId,
            score: s.score,
            label: s.label,
            keywords: s.keywords,
            summary: s.summary,
            serviceId,
          },
        });
      }
    }

    // Save CoworkReport
    const adminUser = await prisma.user.findFirst({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { id: true },
    });

    const positiveCount = (parsed.scores ?? []).filter((s) => s.label === "positive").length;
    const negativeCount = (parsed.scores ?? []).filter((s) => s.label === "negative").length;

    await prisma.coworkReport.create({
      data: {
        seat: "parent-experience",
        reportType: "sentiment-analysis",
        title: `Weekly Sentiment Report — ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
        content: parsed.reportMarkdown ?? text,
        metrics: {
          npsCount: npsResponses.length,
          feedbackCount: quickFeedback.length,
          positiveCount,
          negativeCount,
        },
        alerts: negativeCount > 0 ? [{ level: "warning", message: `${negativeCount} negative sentiment response(s) this week` }] : undefined,
        assignedToId: adminUser?.id,
      },
    });

    // Log AI usage
    if (adminUser) {
      await prisma.aiUsage.create({
        data: {
          userId: adminUser.id,
          templateSlug: "sentiment/weekly-analysis",
          model: template.model,
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          durationMs,
          section: "sentiment",
        },
      });
    }

    await guard.complete({
      npsCount: npsResponses.length,
      feedbackCount: quickFeedback.length,
      scoresCreated: parsed.scores?.length ?? 0,
    });

    return NextResponse.json({
      success: true,
      npsCount: npsResponses.length,
      feedbackCount: quickFeedback.length,
    });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to run sentiment analysis" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/sentiment-analysis/
git commit -m "feat: add weekly sentiment analysis cron — scores NPS + feedback responses"
```

---

### Task 5: Attendance Anomaly Detection Cron

**Files:**
- Create: `src/app/api/cron/attendance-anomaly/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("attendance-anomaly", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const ai = getAI();
    if (!ai) {
      await guard.fail("AI not configured");
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const thirteenWeeksAgo = new Date(now.getTime() - 91 * 86400000);

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, capacity: true },
    });

    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "attendance/anomaly-detection" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let totalAnomalies = 0;
    const highSeverityAlerts: string[] = [];

    for (const service of services) {
      // Get this week's attendance
      const weekRecords = await prisma.dailyAttendance.findMany({
        where: { serviceId: service.id, date: { gte: weekAgo } },
        orderBy: { date: "asc" },
      });

      if (weekRecords.length === 0) continue;

      // Get 13-week historical data for averages
      const historicalRecords = await prisma.dailyAttendance.findMany({
        where: {
          serviceId: service.id,
          date: { gte: thirteenWeeksAgo, lt: weekAgo },
        },
      });

      // Build week data text
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const weekData = weekRecords.map((r) => {
        const day = dayNames[new Date(r.date).getDay()];
        return `${day} | ${r.sessionType} | ${r.enrolled} | ${r.attended} | ${r.capacity}`;
      }).join("\n");

      // Calculate historical averages by session type
      const avgBySession: Record<string, { enrolled: number; attended: number; count: number }> = {};
      for (const r of historicalRecords) {
        if (!avgBySession[r.sessionType]) {
          avgBySession[r.sessionType] = { enrolled: 0, attended: 0, count: 0 };
        }
        avgBySession[r.sessionType].enrolled += r.enrolled;
        avgBySession[r.sessionType].attended += r.attended;
        avgBySession[r.sessionType].count++;
      }

      const historicalAverage = Object.entries(avgBySession).map(([session, data]) =>
        `${session} | ${(data.enrolled / data.count).toFixed(1)} | ${(data.attended / data.count).toFixed(1)}`
      ).join("\n") || "No historical data.";

      let prompt = template.promptTemplate;
      prompt = prompt.replaceAll("{{serviceName}}", service.name);
      prompt = prompt.replaceAll("{{weekData}}", weekData);
      prompt = prompt.replaceAll("{{historicalAverage}}", historicalAverage);
      prompt = prompt.replaceAll("{{capacity}}", String(service.capacity ?? "Unknown"));

      const response = await ai.messages.create({
        model: template.model,
        max_tokens: template.maxTokens,
        system: AMANA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";

      let parsed: { anomalies?: Array<{ day: string; sessionType: string; type: string; severity: string; message: string; expected?: number; actual?: number }>; summary?: string } = { anomalies: [] };
      try {
        parsed = JSON.parse(text);
      } catch {
        continue; // Skip if AI returns invalid JSON
      }

      // Save anomalies
      if (parsed.anomalies && parsed.anomalies.length > 0) {
        for (const a of parsed.anomalies) {
          await prisma.attendanceAnomaly.create({
            data: {
              serviceId: service.id,
              date: now,
              sessionType: a.sessionType || "unknown",
              anomalyType: a.type,
              severity: a.severity,
              message: a.message,
              expected: a.expected ?? null,
              actual: a.actual ?? null,
            },
          });
          totalAnomalies++;
          if (a.severity === "high") {
            highSeverityAlerts.push(`${service.name}: ${a.message}`);
          }
        }
      }
    }

    // Create CoworkReport if anomalies found
    if (totalAnomalies > 0) {
      const adminUser = await prisma.user.findFirst({
        where: { role: { in: ["owner", "admin"] }, active: true },
        select: { id: true },
      });

      const reportContent = highSeverityAlerts.length > 0
        ? `## High Severity Anomalies\n\n${highSeverityAlerts.map((a) => `- **${a}**`).join("\n")}\n\n---\n\n${totalAnomalies} total anomalies detected across ${services.length} centres. Review individual centre attendance tabs for details.`
        : `${totalAnomalies} attendance anomalies detected across ${services.length} centres. No high-severity issues — review at your convenience.`;

      await prisma.coworkReport.create({
        data: {
          seat: "operations",
          reportType: "attendance-anomaly",
          title: `Attendance Anomaly Report — ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
          content: reportContent,
          metrics: { totalAnomalies, highSeverity: highSeverityAlerts.length, centresScanned: services.length },
          alerts: highSeverityAlerts.length > 0
            ? [{ level: "warning", message: `${highSeverityAlerts.length} high-severity attendance anomaly(ies)` }]
            : undefined,
          assignedToId: adminUser?.id,
        },
      });
    }

    await guard.complete({ totalAnomalies, centresScanned: services.length });

    return NextResponse.json({ success: true, totalAnomalies, centresScanned: services.length });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to run attendance anomaly detection" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build and commit**

```bash
npm run build 2>&1 | tail -5
git add src/app/api/cron/attendance-anomaly/
git commit -m "feat: add daily attendance anomaly detection cron"
```

---

### Task 6: Duplicate Detection Cron

**Files:**
- Create: `src/app/api/cron/duplicate-detection/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
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

    const leadsText = leads.map((l) =>
      `ID:${l.id} | School: ${l.schoolName ?? ""} | Contact: ${l.contactName ?? ""} | Email: ${l.contactEmail ?? ""} | Phone: ${l.contactPhone ?? ""} | ${l.suburb ?? ""}, ${l.state ?? ""}`
    ).join("\n") || "No leads.";

    const enquiriesText = enquiries.map((e) =>
      `ID:${e.id} | Parent: ${e.parentName ?? ""} | Email: ${e.parentEmail ?? ""} | Phone: ${e.parentPhone ?? ""} | Child: ${e.childName ?? ""}`
    ).join("\n") || "No enquiries.";

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

    let parsed: { duplicates?: Array<{ entityType: string; entityAId: string; entityBId: string; similarity: number; matchFields: string[]; reason: string }>; summary?: string } = { duplicates: [] };
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

      const duplicatesList = (parsed.duplicates ?? []).map((d) =>
        `- **${d.entityType}**: ${d.reason} (${d.similarity}% match on ${d.matchFields.join(", ")})`
      ).join("\n");

      await prisma.coworkReport.create({
        data: {
          seat: "operations",
          reportType: "duplicate-detection",
          title: `Duplicate Records Report — ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
          content: `## Potential Duplicates Found\n\n${duplicatesList}\n\n---\n\n${parsed.summary ?? `${savedCount} potential duplicate pairs detected.`}\n\nReview and merge or dismiss from the Enquiries page.`,
          metrics: { duplicatesFound: savedCount, leadsScanned: leads.length, enquiriesScanned: enquiries.length },
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

    await guard.complete({ duplicatesFound: savedCount, leadsScanned: leads.length, enquiriesScanned: enquiries.length });

    return NextResponse.json({ success: true, duplicatesFound: savedCount });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to run duplicate detection" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build and commit**

```bash
npm run build 2>&1 | tail -5
git add src/app/api/cron/duplicate-detection/
git commit -m "feat: add weekly duplicate detection cron — scans leads + enquiries"
```

---

## Chunk 3: UI Features (Buttons, Panels, File Upload)

### Task 7: Campaign Brief — AiButton on CampaignDetailPanel

**Files:**
- Modify: `src/components/marketing/CampaignDetailPanel.tsx`

- [ ] **Step 1: Add AiButton import and state**

Add to imports:
```typescript
import { AiButton } from "@/components/ui/AiButton";
import { X } from "lucide-react"; // if not already imported
```

Add state:
```typescript
const [aiBrief, setAiBrief] = useState<string | null>(null);
```

- [ ] **Step 2: Add AiButton to the panel header**

In the CampaignDetailPanel header area (near the campaign name), add the AI button:

```tsx
<AiButton
  templateSlug="marketing/campaign-brief"
  variables={{
    campaignName: campaign.name,
    campaignType: campaign.type,
    goal: campaign.goal || "Not specified",
    platforms: (campaign.platforms || []).join(", ") || "Not specified",
    startDate: campaign.startDate ? new Date(campaign.startDate).toLocaleDateString("en-AU") : "TBD",
    endDate: campaign.endDate ? new Date(campaign.endDate).toLocaleDateString("en-AU") : "TBD",
    targetCentres: campaign.services?.map((s: { name: string }) => s.name).join(", ") || "All centres",
    existingNotes: campaign.notes || "None",
  }}
  onResult={(text) => setAiBrief(text)}
  label="Generate Brief"
  size="sm"
  section="marketing"
/>
```

- [ ] **Step 3: Add collapsible purple brief panel**

Below the header, before the main content:

```tsx
{aiBrief && (
  <div className="mx-6 mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold text-purple-700">AI Campaign Brief</span>
      <button onClick={() => setAiBrief(null)} className="text-purple-400 hover:text-purple-600">
        <X className="h-4 w-4" />
      </button>
    </div>
    <div className="text-sm text-purple-900 whitespace-pre-wrap">{aiBrief}</div>
    <button
      onClick={() => {
        // Copy brief to campaign notes
        handleUpdate({ notes: aiBrief });
        setAiBrief(null);
      }}
      className="mt-3 text-xs text-purple-700 hover:text-purple-900 font-medium"
    >
      Copy to Notes
    </button>
  </div>
)}
```

- [ ] **Step 4: Verify build and commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/marketing/CampaignDetailPanel.tsx
git commit -m "feat: add AI campaign brief generator to CampaignDetailPanel"
```

---

### Task 8: Resume File Upload + AI Screening on VacancyDetailPanel

**Files:**
- Modify: `src/components/recruitment/VacancyDetailPanel.tsx`
- Modify: `src/app/api/recruitment/[id]/candidates/route.ts` (to accept resume fields)

- [ ] **Step 1: Update candidate API to accept resume fields**

In `src/app/api/recruitment/[id]/candidates/route.ts` POST handler, add `resumeText` and `resumeFileUrl` to the create data:

```typescript
// In the POST body parsing, add:
const { name, email, phone, source, notes, resumeText, resumeFileUrl } = body;

// In prisma.recruitmentCandidate.create, add to data:
resumeText: resumeText || null,
resumeFileUrl: resumeFileUrl || null,
```

- [ ] **Step 2: Add file upload + resumeText to VacancyDetailPanel candidate form**

Add to candidate form state:
```typescript
const [candidateForm, setCandidateForm] = useState({
  name: "",
  email: "",
  phone: "",
  source: "indeed",
  notes: "",
  resumeText: "",
  resumeFileUrl: "",
});
const [uploading, setUploading] = useState(false);
```

Add file upload handler:
```typescript
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert("File must be under 10 MB");
    return;
  }

  setUploading(true);
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    setCandidateForm((prev) => ({ ...prev, resumeFileUrl: data.url }));
  } catch {
    alert("Failed to upload file");
  } finally {
    setUploading(false);
  }
};
```

Add to the form JSX (after phone input, before the notes area):
```tsx
{/* Resume Upload */}
<div className="col-span-2">
  <label className="block text-xs text-gray-500 mb-1">Resume / CV</label>
  <div className="flex items-center gap-2">
    <input
      type="file"
      accept=".pdf,.doc,.docx,.txt"
      onChange={handleFileUpload}
      className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
    />
    {uploading && <span className="text-xs text-blue-600">Uploading...</span>}
    {candidateForm.resumeFileUrl && <span className="text-xs text-emerald-600">Uploaded</span>}
  </div>
</div>

{/* Resume Text (paste fallback) */}
<textarea
  placeholder="Or paste resume text here..."
  value={candidateForm.resumeText}
  onChange={(e) => setCandidateForm({ ...candidateForm, resumeText: e.target.value })}
  className="col-span-2 px-3 py-2 text-sm border border-gray-300 rounded-lg h-20 resize-none"
/>
```

Update the form reset after successful add:
```typescript
setCandidateForm({ name: "", email: "", phone: "", source: "indeed", notes: "", resumeText: "", resumeFileUrl: "" });
```

- [ ] **Step 3: Add AI Screen Candidates button and results panel**

Add imports and state:
```typescript
import { AiButton } from "@/components/ui/AiButton";
import { Sparkles } from "lucide-react";

const [screenResults, setScreenResults] = useState<string | null>(null);
```

Add the button in the Candidates header (next to "Add Candidate"):
```tsx
<AiButton
  templateSlug="recruitment/resume-screen"
  variables={{
    vacancyRole: ROLE_LABELS[vacancy.role] || vacancy.role,
    vacancyQualification: vacancy.qualificationRequired?.replace("_", " ") || "none",
    vacancyNotes: vacancy.notes || "None",
    serviceName: vacancy.service?.name || "Amana OSHC",
    candidates: (vacancy.candidates || [])
      .filter((c: { stage: string }) => ["applied", "screened"].includes(c.stage))
      .map((c: { id: string; name: string; source: string; notes: string | null; resumeText: string | null }) =>
        `ID:${c.id} | Name: ${c.name} | Source: ${c.source} | Resume: ${c.resumeText || c.notes || "No resume provided"}`
      )
      .join("\n") || "No candidates to screen.",
  }}
  onResult={(text) => setScreenResults(text)}
  label="Screen Candidates"
  size="sm"
  section="recruitment"
  disabled={!vacancy.candidates?.some((c: { stage: string }) => ["applied", "screened"].includes(c.stage))}
/>
```

Add purple results panel (above candidate list):
```tsx
{screenResults && (
  <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 mb-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5" /> AI Screening Results
      </span>
      <button onClick={() => setScreenResults(null)} className="text-purple-400 hover:text-purple-600">
        <X className="h-4 w-4" />
      </button>
    </div>
    <div className="text-sm text-purple-900 whitespace-pre-wrap">{screenResults}</div>
  </div>
)}
```

- [ ] **Step 4: Verify build and commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/recruitment/VacancyDetailPanel.tsx src/app/api/recruitment/
git commit -m "feat: add resume upload + AI candidate screening to recruitment"
```

---

### Task 9: Attendance Anomaly Alert Banner

**Files:**
- Modify: `src/components/services/ServiceAttendanceTab.tsx`

- [ ] **Step 1: Add anomaly query and alert banner**

Add import and query:
```typescript
import { AlertTriangle, X } from "lucide-react"; // add AlertTriangle if missing

// Inside the component, after existing queries:
const { data: anomalies } = useQuery({
  queryKey: ["attendance-anomalies", serviceId],
  queryFn: async () => {
    const res = await fetch(`/api/attendance/anomalies?serviceId=${serviceId}&dismissed=false`);
    if (!res.ok) return [];
    return res.json();
  },
});
```

Add dismiss handler:
```typescript
const handleDismissAnomaly = async (anomalyId: string) => {
  await fetch(`/api/attendance/anomalies/${anomalyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dismissed: true }),
  });
  queryClient.invalidateQueries({ queryKey: ["attendance-anomalies", serviceId] });
};
```

Add alert banner JSX (below the weekly grid, before the trend chart):
```tsx
{anomalies && anomalies.length > 0 && (
  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <div className="flex items-center gap-2 mb-2">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <span className="text-sm font-semibold text-amber-800">
        Attendance Anomalies Detected
      </span>
    </div>
    <div className="space-y-2">
      {anomalies.map((a: { id: string; severity: string; message: string; anomalyType: string }) => (
        <div key={a.id} className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${
              a.severity === "high" ? "bg-red-500" : a.severity === "medium" ? "bg-amber-500" : "bg-yellow-400"
            }`} />
            <span className="text-sm text-amber-900">{a.message}</span>
          </div>
          <button
            onClick={() => handleDismissAnomaly(a.id)}
            className="text-amber-400 hover:text-amber-600 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Create anomalies API endpoints**

Create `src/app/api/attendance/anomalies/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const dismissed = req.nextUrl.searchParams.get("dismissed");

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (dismissed === "false") where.dismissed = false;

  const anomalies = await prisma.attendanceAnomaly.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(anomalies);
}
```

Create `src/app/api/attendance/anomalies/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/services/ServiceAttendanceTab.tsx src/app/api/attendance/anomalies/
git commit -m "feat: add attendance anomaly alert banner with dismiss"
```

---

### Task 10: Sentiment Badge on Enquiry Cards

**Files:**
- Modify: `src/components/enquiries/EnquiryKanban.tsx` (or the card component used within it)
- Modify: `src/app/(dashboard)/enquiries/page.tsx`

- [ ] **Step 1: Explore EnquiryKanban to find where cards render**

Read the file to find the enquiry card rendering. Add a sentiment badge showing the latest sentiment score for that enquiry's service.

- [ ] **Step 2: Add a sentiment summary widget to the enquiries page**

Below the EnquiryStatsBar, add a small sentiment summary bar:

```tsx
// Query recent sentiment
const { data: sentimentSummary } = useQuery({
  queryKey: ["sentiment-summary"],
  queryFn: async () => {
    const res = await fetch("/api/sentiment/summary");
    if (!res.ok) return null;
    return res.json();
  },
});
```

Create `src/app/api/sentiment/summary/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const scores = await prisma.sentimentScore.findMany({
    where: { createdAt: { gte: weekAgo } },
    select: { label: true, score: true, serviceId: true },
  });

  const positive = scores.filter((s) => s.label === "positive").length;
  const neutral = scores.filter((s) => s.label === "neutral").length;
  const negative = scores.filter((s) => s.label === "negative").length;
  const avgScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
    : null;

  return NextResponse.json({ positive, neutral, negative, total: scores.length, avgScore });
}
```

Add the widget JSX in enquiries page (between stats bar and kanban):

```tsx
{sentimentSummary && sentimentSummary.total > 0 && (
  <div className="flex items-center gap-4 mb-4 px-4 py-2 bg-gray-50 rounded-lg text-sm">
    <span className="text-gray-500 font-medium">This Week&apos;s Sentiment:</span>
    <span className="text-emerald-600">{sentimentSummary.positive} positive</span>
    <span className="text-gray-500">{sentimentSummary.neutral} neutral</span>
    <span className="text-red-500">{sentimentSummary.negative} negative</span>
    {sentimentSummary.avgScore !== null && (
      <span className="text-gray-400 text-xs">
        (avg: {sentimentSummary.avgScore.toFixed(2)})
      </span>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build 2>&1 | tail -5
git add src/app/(dashboard)/enquiries/page.tsx src/app/api/sentiment/
git commit -m "feat: add sentiment summary widget to enquiries page"
```

---

## Chunk 4: Final Integration + Deploy

### Task 11: Seed Templates to Production + Push Schema

- [ ] **Step 1: Seed all 5 new templates to Railway production DB**

Run standalone seed script with `DATABASE_URL` set to Railway.

- [ ] **Step 2: Push to remote**

```bash
git push origin main
```

- [ ] **Step 3: Verify Vercel deployment succeeds**

Check build logs. All 3 new crons should register.

### Task 12: Update Memory Files

- [ ] **Step 1: Update ai-infrastructure.md**

Add Phase 2 section with the 5 features, their patterns, and file locations.

- [ ] **Step 2: Update MEMORY.md**

Add Phase 2 summary to recent work section.
