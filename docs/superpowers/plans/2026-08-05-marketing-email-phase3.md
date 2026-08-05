# Marketing Hub — Phase 3 (Trustworthy Email) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make marketing email trustworthy: a Brevo events webhook so opens/clicks/bounces are finally recorded (`EmailEvent` is write-only dead weight today because campaigns send via Brevo but the only webhook listens to Resend); suppression enforced on the campaign send path; a "send test to me" button; open/click surfaced in analytics; and the creative-request assignment email done properly (deferred from Phase 2).

**Architecture:** New `/api/webhooks/brevo` (shared-secret query auth — Brevo doesn't sign) normalises Brevo's event vocabulary to the existing `EmailEvent.type` set and correlates events back to `DeliveryLog` via a new `externalIdType` discriminator (`brevo_message` for <50 transactional sends matched on `message-id`; `brevo_campaign` for ≥50 matched on `camp_id`), stamping a new `EmailEvent.deliveryLogId`. Suppression gets a batch helper (`getSuppressedEmails`) used by the campaign send, the recipient-count endpoint, and retrofitted into the Resend `sendEmail` loop. Test-send is a separate authenticated route that renders the composer's REAL payload and sends only to the session user's own email. The assignment email extends `sendAssignmentEmail` with a `creative_request` type that deliberately bypasses the leadership-only nudge gate (marketing-role assignees are the audience; it's a work-queue notification, not a nudge).

**Tech Stack:** unchanged. Email providers stay split by design: Brevo = marketing sends, Resend = transactional/assignment.

---

## ⚠️ Critical context

1. **`.env.local` DATABASE_URL is PRODUCTION.** Same migration rules as Phases 1–2: offline schema-to-schema `prisma migrate diff` only; build verification = `npx prisma generate && npx next build`; prisma CLI needs `set -a; source .env.local; set +a`.
2. **New env vars** this phase: `BREVO_WEBHOOK_SECRET` (webhook auth). Add to `.env.example` with a comment; the deploy needs it set in Vercel + the same secret in Brevo's webhook URL config (`https://amanaoshc.company/api/webhooks/brevo?secret=...`). Note this in the PR body — the webhook is inert until Jayden configures Brevo.
3. **Key file map** (from investigation — line refs approximate):
   - `src/lib/brevo.ts` — `sendTransactionalEmail` (returns `{messageId}`, forwards `tags[]`), `sendCampaignEmail` (returns `{campaignId: number}`, forwards only `tags[0]` as `tag`)
   - `src/app/api/email/campaign/send/route.ts` — recipient build at ~150–179 (dedupe loop), <50/≥50 split at ~192, DeliveryLog.create at ~249
   - `src/app/api/webhooks/resend/route.ts` — the pattern to mirror for parsing/response codes (but NOT its Svix auth)
   - `src/app/api/webhooks/nps-response/route.ts` — the `?secret=` + `crypto.timingSafeEqual` auth pattern to copy
   - `src/lib/email-suppression.ts` — `isEmailSuppressed`/`suppressEmail` (single-address only today)
   - `src/lib/email.ts:52` — Resend `sendEmail` wrapper's per-address suppression loop (retrofit target)
   - `src/lib/send-assignment-email.ts` — `type: "todo"|"rock"|"issue"`, fire-and-forget, `shouldReceiveNudge` gate at ~56, Resend direct
   - `src/lib/notification-recipients.ts:29-34` — `NUDGE_LEADERSHIP_ROLES` excludes `marketing` BY DESIGN; do not modify it
   - `src/lib/email-templates/notifications.ts` — `todoAssignedEmail` template pattern (`applyEmailTemplateOverride` + `baseLayout` + `buttonHtml`)
   - `src/components/email/EmailComposer.tsx` — `handleConfirmSend` at ~216 currently DROPS blocks/htmlContent/scheduledAt/postId (real bug, fixed in Task 5)
   - `src/app/api/email/analytics/route.ts` — dailyVolume derived from only 50 rows (bug, fixed in Task 7)
   - `src/middleware.ts` — allow-list matcher; `/api/webhooks/*` never hits auth, NO registration needed
4. **Brevo webhook payload** (flat JSON, kebab-case): `{ event, email, id, "message-id", ts, tag/tags, link (clicks), reason (bounces), camp_id + campaign name (campaign events) }`. Event names: `delivered, opened, unique_opened, click, hard_bounce, soft_bounce, spam, unsubscribed, blocked, deferred, request`.
5. **No DB unique constraint for EmailEvent idempotency** — prod may already hold duplicate rows; adding a unique would fail `migrate deploy`. Webhook does a best-effort `findFirst`-then-create dedupe instead (documented).
6. Known-accepted: 11 pre-existing test failures were FIXED on main by PR #208 — the gate is now a fully green `npm test` except any newly-discovered pre-existing failures (verify against base before blaming new code). Scheduled-run E2E failures are pre-existing.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `EmailEvent.deliveryLogId` + index; `DeliveryLog.externalIdType` + `@@index([externalId])` |
| `prisma/migrations/<ts>_email_event_linkage/migration.sql` (create) | Offline, additive-only |
| `src/lib/brevo-events.ts` (create) | Pure: Brevo→canonical event map, payload parsing, suppression-trigger set |
| `src/lib/email-suppression.ts` (modify) | + `getSuppressedEmails(emails): Promise<Set<string>>` (single findMany) |
| `src/lib/email.ts` (modify) | Retrofit per-address loop onto the batch helper |
| `src/app/api/webhooks/brevo/route.ts` (create) | Secret auth, normalise, correlate → deliveryLogId, dedupe, auto-suppress |
| `src/app/api/email/campaign/send/route.ts` (modify) | Suppression filter (both branches), `externalIdType`, post-filter recipientCount, suppressedCount in response |
| `src/app/api/email/recipient-count/route.ts` (modify) | Same suppression filter so counts agree |
| `src/app/api/email/test-send/route.ts` (create) | Render real payload → session user's own email only |
| `src/components/email/EmailComposer.tsx` (modify) | "Send test to me" button + fix handleConfirmSend payload bug |
| `src/hooks/useEmailTemplates.ts` (modify) | test-send mutation + fixed send payload types |
| `src/lib/send-assignment-email.ts` (modify) | `creative_request` union member + gate bypass + entityId deep link |
| `src/lib/email-templates/notifications.ts` (modify) | `creativeRequestAssignedEmail` template |
| `src/app/api/creative-requests/[id]/route.ts` (modify) | Fire assignment email on assignee change |
| `src/app/api/email/analytics/route.ts` (modify) | opens/clicks aggregates + dailyVolume full-window fix |
| `src/components/marketing/EmailAnalytics.tsx` (modify) | Open/click stat cards |
| `.env.example` (modify) | `BREVO_WEBHOOK_SECRET` |
| Tests | new `src/__tests__/lib/brevo-events.test.ts`, `src/__tests__/api/webhooks-brevo.test.ts`, `src/__tests__/api/email-test-send.test.ts`; extend `email-suppression.test.ts`, creative-requests test, analytics/campaign-send coverage (check what exists for campaign/send — extend or create `email-campaign-send.test.ts`) |

Out of scope (Phase 4): audiences/segments, campaign report page (24h curve, per-link table), campaign umbrella, local scheduled-send cancel.

---

## Chunk 1: Data + webhook

### Task 1: Schema + migration

- [ ] **Step 1:** In `model EmailEvent` add after `messageId`:

```prisma
  /// Resolved at webhook-ingest time by matching the provider identifier
  /// against DeliveryLog.externalId (see externalIdType there). Null when
  /// no send row matched (e.g. events for mail sent outside the dashboard).
  deliveryLogId String?
```

and `@@index([deliveryLogId])` alongside the existing indexes. Update the `messageId` comment from "Resend message ID" to "Provider message ID (Resend or Brevo message-id; `camp:<id>` for Brevo campaign-level events with no per-recipient id)".

- [ ] **Step 2:** In `model DeliveryLog` add after `externalId`:

```prisma
  /// Disambiguates what externalId holds: "resend_message" | "brevo_message"
  /// (<50-recipient transactional sends) | "brevo_campaign" (>=50 sends,
  /// Brevo numeric campaign id as string). Null on legacy rows.
  externalIdType String?
```

and `@@index([externalId])`.

- [ ] **Step 3:** validate → offline `migrate diff` into `prisma/migrations/20260805230000_email_event_linkage/` (same procedure; scratchpad temp file) → inspect additive-only (2 ADD COLUMN + 2 CREATE INDEX) → `npx prisma generate` → commit `feat(email): EmailEvent↔DeliveryLog linkage fields`.

### Task 2: Brevo event normalisation lib + batch suppression (TDD)

**Files:** Create `src/lib/brevo-events.ts`; Modify `src/lib/email-suppression.ts`, `src/lib/email.ts`; Tests: new `src/__tests__/lib/brevo-events.test.ts`, extend `src/__tests__/lib/email-suppression.test.ts`

- [ ] **Step 1: Failing tests — brevo-events**

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeBrevoEvent,
  parseBrevoWebhookBody,
  SUPPRESSION_EVENTS,
} from "@/lib/brevo-events";

describe("normalizeBrevoEvent", () => {
  it("maps Brevo names onto the canonical EmailEvent vocabulary", () => {
    expect(normalizeBrevoEvent("delivered")).toBe("delivered");
    expect(normalizeBrevoEvent("opened")).toBe("opened");
    expect(normalizeBrevoEvent("unique_opened")).toBe("opened");
    expect(normalizeBrevoEvent("click")).toBe("clicked");
    expect(normalizeBrevoEvent("hard_bounce")).toBe("bounced");
    expect(normalizeBrevoEvent("spam")).toBe("complained");
    expect(normalizeBrevoEvent("unsubscribed")).toBe("unsubscribed");
    expect(normalizeBrevoEvent("blocked")).toBe("blocked");
  });
  it("returns null for ignorable events", () => {
    for (const e of ["soft_bounce", "deferred", "request", "loaded_by_proxy", "whatever"]) {
      expect(normalizeBrevoEvent(e)).toBeNull();
    }
  });
});

describe("SUPPRESSION_EVENTS", () => {
  it("suppresses hard bounces, spam, unsubscribes and blocks — not opens/clicks", () => {
    expect(SUPPRESSION_EVENTS.has("bounced")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("complained")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("unsubscribed")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("blocked")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("opened")).toBe(false);
    expect(SUPPRESSION_EVENTS.has("clicked")).toBe(false);
    expect(SUPPRESSION_EVENTS.has("delivered")).toBe(false);
  });
});

describe("parseBrevoWebhookBody", () => {
  it("extracts a transactional event", () => {
    const parsed = parseBrevoWebhookBody({
      event: "click",
      email: "Parent@Example.com",
      "message-id": "<msg-1@smtp-relay.brevo.com>",
      link: "https://amanaoshc.company/book",
      ts: 1754500000,
    });
    expect(parsed).toEqual({
      type: "clicked",
      email: "parent@example.com",
      messageId: "<msg-1@smtp-relay.brevo.com>",
      campId: null,
    });
  });
  it("extracts a campaign event (camp_id, no per-recipient message-id)", () => {
    const parsed = parseBrevoWebhookBody({
      event: "opened",
      email: "parent@example.com",
      camp_id: 42,
    });
    expect(parsed).toEqual({
      type: "opened",
      email: "parent@example.com",
      messageId: "camp:42",
      campId: "42",
    });
  });
  it("returns null when the event is ignorable or fields are missing", () => {
    expect(parseBrevoWebhookBody({ event: "deferred", email: "a@b.c" })).toBeNull();
    expect(parseBrevoWebhookBody({ event: "click" })).toBeNull(); // no email
    expect(parseBrevoWebhookBody("not-an-object")).toBeNull();
  });
});
```

- [ ] **Step 2: Failing tests — batch suppression** (append to the existing `email-suppression.test.ts`, matching its mock style)

```ts
describe("getSuppressedEmails", () => {
  it("returns the lowercased subset that is suppressed, in one query", async () => {
    prismaMock.emailSuppression.findMany.mockResolvedValue([
      { email: "bad@example.com" },
    ] as never);
    const result = await getSuppressedEmails(["Bad@Example.com", "ok@example.com"]);
    expect(result).toEqual(new Set(["bad@example.com"]));
    expect(prismaMock.emailSuppression.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.emailSuppression.findMany.mock.calls[0][0];
    expect(args.where.email.in).toEqual(["bad@example.com", "ok@example.com"]);
  });
  it("returns an empty set for an empty input without querying", async () => {
    const result = await getSuppressedEmails([]);
    expect(result).toEqual(new Set());
    expect(prismaMock.emailSuppression.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3:** Confirm failures. Implement `src/lib/brevo-events.ts`:

```ts
/**
 * Pure helpers for the Brevo events webhook. Brevo's event vocabulary is
 * normalised onto the canonical EmailEvent.type set already used by the
 * Resend webhook (delivered/opened/clicked/bounced/complained) plus
 * unsubscribed/blocked, so analytics never forks by provider.
 */

export type CanonicalEmailEvent =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "blocked";

const EVENT_MAP: Record<string, CanonicalEmailEvent> = {
  delivered: "delivered",
  opened: "opened",
  unique_opened: "opened",
  click: "clicked",
  hard_bounce: "bounced",
  spam: "complained",
  unsubscribed: "unsubscribed",
  blocked: "blocked",
};

/** Events that add the address to the suppression list. */
export const SUPPRESSION_EVENTS: ReadonlySet<CanonicalEmailEvent> = new Set([
  "bounced",
  "complained",
  "unsubscribed",
  "blocked",
]);

/** Soft bounces, deferrals etc. are deliberately ignored (return null). */
export function normalizeBrevoEvent(event: string): CanonicalEmailEvent | null {
  return EVENT_MAP[event] ?? null;
}

export interface ParsedBrevoEvent {
  type: CanonicalEmailEvent;
  email: string;
  /** Brevo per-recipient message-id, or `camp:<id>` for campaign-level events. */
  messageId: string;
  /** Present only on campaign events — matches DeliveryLog.externalId for brevo_campaign rows. */
  campId: string | null;
}

export function parseBrevoWebhookBody(raw: unknown): ParsedBrevoEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const type = typeof body.event === "string" ? normalizeBrevoEvent(body.event) : null;
  const email = typeof body.email === "string" ? body.email.toLowerCase() : null;
  if (!type || !email) return null;
  const campId = body.camp_id != null ? String(body.camp_id) : null;
  const rawMessageId = typeof body["message-id"] === "string" ? body["message-id"] : null;
  const messageId = rawMessageId ?? (campId ? `camp:${campId}` : null);
  if (!messageId) return null;
  return { type, email, messageId, campId };
}
```

- [ ] **Step 4:** Implement `getSuppressedEmails` in `email-suppression.ts`:

```ts
/**
 * Batch variant of isEmailSuppressed — one findMany instead of N findUniques.
 * Returns the lowercased subset of `emails` that is suppressed.
 */
export async function getSuppressedEmails(emails: string[]): Promise<Set<string>> {
  const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (lowered.length === 0) return new Set();
  const rows = await prisma.emailSuppression.findMany({
    where: { email: { in: lowered } },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}
```

- [ ] **Step 5:** Retrofit `src/lib/email.ts`'s per-address `isEmailSuppressed` loop onto `getSuppressedEmails` (behavior identical: filter the recipient list, same logging). Run its existing tests (`src/__tests__/lib/` sweep) — adjust mocks if they stub `isEmailSuppressed` (route the mock to the new helper or keep both paths tested; do NOT weaken assertions).

- [ ] **Step 6:** All green; commit `feat(email): brevo event normalisation + batch suppression helper`.

### Task 3: Brevo webhook route (TDD)

**Files:** Create `src/app/api/webhooks/brevo/route.ts`; Modify `.env.example`; Test: new `src/__tests__/api/webhooks-brevo.test.ts`

- [ ] **Step 1: Failing tests** — mirror the structure of the existing resend webhook tests if present (check `src/__tests__/api/` for a webhooks-resend test to copy mock style; else follow creative-requests test style with `withApiHandler` route). Cover:
- 401 when `?secret=` missing/wrong (mock `process.env.BREVO_WEBHOOK_SECRET = "s3cret"` via `vi.stubEnv`); 500 when env unset.
- Ignorable event (`soft_bounce`) → 200 `{received: true}`, no EmailEvent write.
- Transactional `click` event: matched `DeliveryLog` (mock `findFirst` on `externalId` + `externalIdType: "brevo_message"` → `{id: "dl1"}`) → `emailEvent.create` with `{messageId, type: "clicked", email, deliveryLogId: "dl1", payload}`.
- Campaign `opened` event with `camp_id`: `deliveryLog.findFirst` called with `externalId: "42", externalIdType: "brevo_campaign"` → linked.
- No matching DeliveryLog → event still written with `deliveryLogId: null`.
- Dedupe: existing identical event (mock `emailEvent.findFirst` → a row) → 200, no create.
- `hard_bounce` → `emailSuppression.upsert` called (via suppressEmail) AND event written.

- [ ] **Step 2:** Implement `src/app/api/webhooks/brevo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { suppressEmail } from "@/lib/email-suppression";
import { parseBrevoWebhookBody, SUPPRESSION_EVENTS } from "@/lib/brevo-events";

/**
 * Brevo events webhook — the missing half of marketing email tracking.
 * Campaigns send via Brevo but (pre-Phase 3) the only events webhook was
 * Resend's, so EmailEvent never recorded marketing opens/clicks.
 *
 * Auth: Brevo doesn't sign webhooks; the URL configured in Brevo carries
 * a shared secret (?secret=...) compared in constant time — same pattern
 * as /api/webhooks/nps-response.
 *
 * Idempotency: best-effort findFirst-then-create dedupe on
 * (messageId, type, email). A DB unique would be cleaner but prod already
 * holds pre-constraint rows; revisit if double-counting ever matters.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = withApiHandler(async (req) => {
  const expected = process.env.BREVO_WEBHOOK_SECRET;
  if (!expected) {
    logger.error("BREVO_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(req.url);
  if (!secretMatches(searchParams.get("secret"), expected)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ received: true }); // malformed → ack, don't retry-loop
  }

  const parsed = parseBrevoWebhookBody(raw);
  if (!parsed) return NextResponse.json({ received: true });

  // Correlate back to the send that produced this event.
  const deliveryLog = await prisma.deliveryLog.findFirst({
    where: parsed.campId
      ? { externalId: parsed.campId, externalIdType: "brevo_campaign" }
      : { externalId: parsed.messageId, externalIdType: "brevo_message" },
    select: { id: true },
  });

  // Best-effort idempotency (Brevo retries on non-2xx).
  const existing = await prisma.emailEvent.findFirst({
    where: { messageId: parsed.messageId, type: parsed.type, email: parsed.email },
    select: { id: true },
  });
  if (!existing) {
    await prisma.emailEvent.create({
      data: {
        messageId: parsed.messageId,
        type: parsed.type,
        email: parsed.email,
        deliveryLogId: deliveryLog?.id ?? null,
        payload: raw as object,
      },
    });
  }

  if (SUPPRESSION_EVENTS.has(parsed.type)) {
    await suppressEmail(parsed.email, parsed.type, parsed.messageId);
    logger.warn("Email suppressed via Brevo webhook", {
      email: parsed.email,
      type: parsed.type,
    });
  }

  return NextResponse.json({ received: true });
});
```

- [ ] **Step 3:** Add to `.env.example`: `BREVO_WEBHOOK_SECRET= # shared secret in the Brevo webhook URL (?secret=...) — required for /api/webhooks/brevo`.
- [ ] **Step 4:** Green; commit `feat(email): brevo events webhook — opens/clicks finally tracked`.

---

## Chunk 2: Send-path hardening

### Task 4: Suppression on the campaign send path (TDD)

**Files:** Modify `src/app/api/email/campaign/send/route.ts`, `src/app/api/email/recipient-count/route.ts`; Test: check `src/__tests__/api/` for existing campaign-send coverage — extend it, else create `src/__tests__/api/email-campaign-send.test.ts` with the standard mock preamble.

- [ ] **Step 1: Failing tests** — cover:
- Suppressed recipients are excluded: 3 subscribed contacts, 1 suppressed → send called with 2 recipients, `DeliveryLog.recipientCount === 2`, response includes `suppressedCount: 1`.
- ALL recipients suppressed → 400 ("All recipients are suppressed or unsubscribed"), no send.
- Enquiry branch: single suppressed recipient → 409 with a clear message, no send.
- `externalIdType` written: transactional path stores `"brevo_message"`, campaign path (mock 60 recipients) stores `"brevo_campaign"`.
- recipient-count route: returns the post-suppression count (mock 5 subscribed, 2 suppressed → `{count: 3}` — read the route first for its actual response shape and match it).

- [ ] **Step 2: Implement.** In `campaign/send/route.ts`, after the dedupe loop: look up `getSuppressedEmails(recipients.map(r => r.email))`, filter, keep `suppressedCount`; empty-after-filter → `ApiError.badRequest("All recipients are suppressed or unsubscribed")`; enquiry branch → `ApiError.conflict("This recipient has unsubscribed or bounced — email them individually if genuinely needed")`. Write `externalIdType` in BOTH DeliveryLog.create calls (success + failure paths — on failure `externalIdType` stays undefined since no send happened). Include `suppressedCount` in the success response JSON and inside `payload` (augment the stored `raw` object as `{...raw, _suppressedCount: suppressedCount}` — keep it namespaced so replays aren't confused). Mirror the filter in `recipient-count`.

- [ ] **Step 3:** Green (incl. any pre-existing campaign-send tests untouched); commit `feat(email): enforce suppression list on campaign sends`.

### Task 5: Test-send route + composer fixes (TDD route; UI verified by build/lint)

**Files:** Create `src/app/api/email/test-send/route.ts`; Modify `src/hooks/useEmailTemplates.ts`, `src/components/email/EmailComposer.tsx`; Test: new `src/__tests__/api/email-test-send.test.ts`

- [ ] **Step 1: Failing route tests:**
- 401 unauthenticated; 503 when Brevo unconfigured (mock `isBrevoConfigured` → false).
- Sends ONLY to the session user's email regardless of body (no `to` field accepted — assert the sendTransactionalEmail mock got `[{email: session email}]`).
- Subject prefixed `[Test] `; blocks payload rendered via the same resolution order as campaign/send (blocks → htmlContent); 400 when neither provided and no templateId.
- Creates a DeliveryLog with `messageType: "test"`, `recipientCount: 1`, `externalIdType: "brevo_message"`; never touches MarketingPost.
- Suppression deliberately NOT applied, but if the user's own address IS suppressed, respond 200 with `{warning: "your address is on the suppression list — the mail may not arrive"}` alongside success.

- [ ] **Step 2: Implement the route** — `withApiAuth`, zod body `{ subject, blocks?, htmlContent?, templateId? }` (reuse the campaign route's HTML-resolution helpers by extracting them if trivially shareable, else duplicate the small resolution block with a comment). Send via `sendTransactionalEmail` with `tags: ["test-send"]`. `session.user.email` missing → 400.

- [ ] **Step 3: Hook + composer.** In `useEmailTemplates.ts` add `useTestSend()` (house mutation standards). In `EmailComposer.tsx`:
  - Add a "Send test to me" outline Button beside the Templates button; disabled while sending; success toast "Test sent to <email>" (get email from the mutation response to avoid needing useSession).
  - **Fix the payload bug in `handleConfirmSend`**: send the real composed content — `mode === "blocks" ? { blocks } : { htmlContent }` plus `subject`, `serviceIds`/`allCentres`, `scheduledAt`, `postId`, `templateId` only when actually applicable (read the campaign route's zod schema and construct a payload that exercises the intended path; the test-send button uses the same construction minus scheduling/post linkage).
- [ ] **Step 4:** eslint + `npx next build`; commit `feat(email): test-send to self + composer sends the real composed payload`.

### Task 6: Creative-request assignment email (TDD)

**Files:** Modify `src/lib/send-assignment-email.ts`, `src/lib/email-templates/notifications.ts`, `src/app/api/creative-requests/[id]/route.ts`; Tests: extend `src/__tests__/api/creative-requests.test.ts` (mock the email module) + a small template/gate test if `send-assignment-email` has an existing test file (check; else route-level mock assertions suffice).

- [ ] **Step 1:** Template `creativeRequestAssignedEmail(assigneeName, requestTitle, requestNumber, assignerName, dashboardUrl)` in `notifications.ts` following `todoAssignedEmail`'s exact pattern (override key `notifications.creativeRequestAssigned`, `buttonHtml("View request", dashboardUrl)`).
- [ ] **Step 2:** Extend `sendAssignmentEmail`: union `"creative_request"`, optional `entityId` and `entityNumber` params; deep link `${baseUrl}/requests?open=${entityId}`. **Gate decision (documented in code):** for `type === "creative_request"` skip `shouldReceiveNudge` (it excludes marketing-role users by design — this is a work-queue notification, not a leadership nudge) but still require `assignee.active` and `!assignee.notificationsMuted`. Keep fire-and-forget contract.
- [ ] **Step 3:** Call site in `[id]/route.ts` where `notifyRequestAssigned` fires: also call (un-awaited, matching every other caller) `sendAssignmentEmail({ type: "creative_request", assigneeId: patch.assigneeId, assignerId: session.user.id, entityTitle: updated.title, entityId: updated.id, entityNumber: updated.requestNumber })` — only when `patch.assigneeId` is non-null and changed.
- [ ] **Step 4:** Tests: route test asserting the mocked `sendAssignmentEmail` is called with `type: "creative_request"` on assignment (and NOT on unassign/no-change). Green; commit `feat(creative-requests): assignment email (work-queue gate, not nudge)`.

### Task 7: Analytics — opens/clicks + window fix (TDD)

**Files:** Modify `src/app/api/email/analytics/route.ts`, `src/components/marketing/EmailAnalytics.tsx`; Test: check for an existing analytics test — extend, else create `src/__tests__/api/email-analytics.test.ts`.

- [ ] **Step 1: Failing tests:** response now includes `stats.opens`, `stats.clicks`, `stats.uniqueOpens` (distinct emails with an `opened` event in the window); dailyVolume computed from a full-window query, not the 50-row slice (assert the new `findMany`/`groupBy` is called with the window `where`, and the 50-row `recentSends` query remains separate).
- [ ] **Step 2: Implement:** add `prisma.emailEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since }, type: { in: ["opened", "clicked"] } }, _count: true })` for totals and `groupBy({ by: ["type", "email"], ... })` length for uniques (or two targeted queries — keep it to ≤2 extra queries). Fix dailyVolume with a dedicated `findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })` binned in JS (matches current binning code). UI: two new StatCards ("Opens (30d)", "Clicks (30d)") + a muted caption "Tracking starts from Phase 3 deploy — historical sends have no events".
- [ ] **Step 3:** Green + eslint + build; commit `feat(email): surface opens/clicks; fix daily-volume window`.

### Task 8: Final verification + PR

- [ ] Full gates: all phase test files green; `npm test` — expect FULLY GREEN now (PR #208 fixed the legacy failures) minus any newly-discovered pre-existing issues (stash-verify before attributing); eslint clean on touched files; `npx prisma generate && npx next build`.
- [ ] CLAUDE.md: update the email bullets — Brevo webhook + EmailEvent linkage, suppression enforced at send, test-send route, assignment-email gate note.
- [ ] Final holistic reviewer over the phase diff (cross-cutting: webhook↔send-route externalIdType contract, suppression consistency across send/count/email.ts, composer payload fix vs campaign zod schema, migration byte-diff).
- [ ] Push, `gh pr create` — PR body MUST include the deploy checklist: set `BREVO_WEBHOOK_SECRET` in Vercel, configure the webhook URL in Brevo (all event types), then smoke-test: send a campaign, open it, confirm an EmailEvent row + analytics tick up.
