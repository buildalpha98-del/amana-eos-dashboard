import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import type { EmploymentType } from "@prisma/client";

/**
 * POST /api/offboarding/seed
 *
 * Owner-only endpoint that seeds the award-compliant offboarding
 * packs. Idempotent: any pack that already exists (by name) is
 * skipped, so re-running is safe.
 *
 * 2026-07-08: replaced the single "Standard Staff Offboarding"
 * pack with two MA000120-aligned packs — one for casuals (no
 * notice, no leave payout, casual loading covers annual leave)
 * and one for permanent/part-time (NES notice, leave payout,
 * regulatory notifications, letters). The assign endpoint auto-
 * picks the right pack based on the departing user's contract
 * employment type; users can still override manually.
 *
 * Run from browser console:
 *   fetch('/api/offboarding/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
 */

interface TaskSpec {
  title: string;
  description?: string;
  category: string;
  isRequired: boolean;
}

interface PackSpec {
  name: string;
  description: string;
  isDefault: boolean;
  applicableEmploymentTypes: EmploymentType[];
  tasks: TaskSpec[];
}

// ─────────────────────────────────────────────────────────────
// Pack A — Casual (MA000120 + NES casual rules)
// ─────────────────────────────────────────────────────────────
const CASUAL_PACK: PackSpec = {
  name: "Casual Offboarding — MA000120",
  description:
    "Children's Services Award (MA000120) compliant offboarding for casual staff. No notice period. Focus on final pay, super, records, and access removal.",
  isDefault: false,
  applicableEmploymentTypes: ["casual"],
  tasks: [
    // ── Notice
    {
      title: "Record last shift worked",
      description:
        "No notice period is required for casual staff under MA000120 or the NES. Confirm the date of the casual's final worked shift.",
      category: "notice",
      isRequired: true,
    },
    {
      title: "Check for regular & systematic 6+ month pattern",
      description:
        "If the casual has worked a regular and systematic pattern for 6+ months they have conversion rights under the Closing Loopholes No. 2 Act (Aug 2024). Confirm ending the engagement isn't circumventing a valid conversion request. If it is, treat as dismissal with a documented reason.",
      category: "notice",
      isRequired: true,
    },
    // ── Final pay
    {
      title: "All shifts timesheeted and approved in Employment Hero",
      description:
        "Every attended shift up to the last day must be entered in EH timesheets, submitted, and approved.",
      category: "final_pay",
      isRequired: true,
    },
    {
      title: "Process final pay in EH (within 7 days — MA000120 cl 15)",
      description:
        "Casual final pay = outstanding hours × hourly rate. Casual loading (already in the rate) covers annual leave — no separate accrual payout.",
      category: "final_pay",
      isRequired: true,
    },
    // ── Super
    {
      title: "Confirm final super in next quarterly SG batch",
      description:
        "Superannuation Guarantee is paid quarterly (28 days after quarter end). Ensure the final pay's SG contribution is included in the next batch.",
      category: "super",
      isRequired: true,
    },
    // ── Leave (LSL only — casual loading covers annual leave)
    {
      title: "Long Service Leave check (5+ years continuous service)",
      description:
        "State LSL Acts apply, not MA000120. NSW: pro-rata from 5 years continuous service. VIC / QLD: 7 years (with 5-year pro-rata in some cases). Casuals can accrue LSL if service is continuous under the state Act.",
      category: "leave",
      isRequired: false,
    },
    // ── Equipment
    {
      title: "Return uniform, ID badge, keys",
      category: "equipment",
      isRequired: true,
    },
    {
      title: "Return centre iPad or issued equipment",
      category: "equipment",
      isRequired: false,
    },
    // ── Access
    {
      title: "Deactivate dashboard account (auto on Separation finalise)",
      description:
        "The User.active flag is set to false automatically when the Separation record is finalised. Verify this happened.",
      category: "access",
      isRequired: true,
    },
    {
      title: "Deactivate OWNA educator profile",
      category: "access",
      isRequired: true,
    },
    {
      title: "Deactivate kiosk PIN (clock-in)",
      category: "access",
      isRequired: true,
    },
    {
      title: "Remove from WhatsApp and staff comms groups",
      category: "access",
      isRequired: true,
    },
    {
      title: "Remove from centre-specific email distribution lists",
      category: "access",
      isRequired: false,
    },
    // ── Handover
    {
      title: "Update Weekly Roster (remove upcoming shifts)",
      category: "handover",
      isRequired: true,
    },
    {
      title: "Update emergency contact / centre lists",
      category: "handover",
      isRequired: true,
    },
    // ── Letters
    {
      title: "Statement of Service prepared (on request)",
      description:
        "Fair Work requires a Statement of Service on written request. Include: dates of employment, position(s) held, estimated gross weekly pay.",
      category: "letter",
      isRequired: false,
    },
    // ── Records
    {
      title: "Archive employment records (7-year retention — Fair Work Reg 3.44)",
      description:
        "Retain contract, timesheets, pay records, super records, WWCC copies for 7 years after employment ends.",
      category: "records",
      isRequired: true,
    },
    // ── Exit
    {
      title: "Brief exit interview (optional)",
      description:
        "For casuals, a short 3-question exit interview is enough: (1) reason for leaving, (2) overall satisfaction 1–5, (3) would you return?",
      category: "exit_interview",
      isRequired: false,
    },
    {
      title: "Update rehire eligibility flag on Separation record",
      description:
        "Feeds the recruitment pipeline — candidates flagged if they reapply.",
      category: "exit_interview",
      isRequired: true,
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Pack B — Permanent (Full-time + Part-time) — MA000120 + NES
// ─────────────────────────────────────────────────────────────
const PERMANENT_PACK: PackSpec = {
  name: "Permanent Offboarding — MA000120",
  description:
    "Children's Services Award (MA000120) compliant offboarding for full-time and part-time staff. Covers NES notice, leave payout, letters, and regulatory notifications.",
  isDefault: true,
  applicableEmploymentTypes: ["part_time", "permanent"],
  tasks: [
    // ── Notice + termination letter
    {
      title: "Issue written notice of termination",
      description:
        "NES minimum notice: <1yr = 1 week, 1–3yrs = 2 weeks, 3–5yrs = 3 weeks, 5+yrs = 4 weeks. Add +1 week if the employee is 45+ and has 2+ years of continuous service. MA000120 mirrors the NES table.",
      category: "notice",
      isRequired: true,
    },
    {
      title: "Payment in lieu of notice (PIL)",
      description:
        "If terminating without working the notice period, pay PIL at the pre-tax gross weekly rate for the applicable notice period.",
      category: "notice",
      isRequired: false,
    },
    {
      title: "Serve written termination letter with reason",
      description:
        "Formal letter documenting reason, effective date, notice arrangement, final pay date. Signed by manager and counter-signed by staff.",
      category: "letter",
      isRequired: true,
    },
    {
      title: "Procedural fairness checklist (dismissal cases only)",
      description:
        "For dismissal_capacity or dismissal_misconduct: confirm the employee was told the reason, given a chance to respond, and offered a support person. Link to the Performance / Disciplinary case that justifies the termination.",
      category: "notice",
      isRequired: true,
    },
    // ── Redundancy (only if reason = redundancy)
    {
      title: "Compute redundancy pay (NES s.119 — redundancy only)",
      description:
        "Applies only if reason = redundancy AND employer has 15+ employees AND the role is genuinely no longer required. Weeks of pay range from 4 (1 year) to 16 (10+ years) per the NES scale.",
      category: "final_pay",
      isRequired: false,
    },
    // ── Final pay + leave
    {
      title: "All shifts timesheeted and approved in Employment Hero",
      category: "final_pay",
      isRequired: true,
    },
    {
      title: "Compute annual leave payout",
      description:
        "Accrued unused annual leave × final ordinary rate. Add 17.5% annual leave loading if the employee would have received it while on leave (MA000120 cl 27.6).",
      category: "leave",
      isRequired: true,
    },
    {
      title: "Personal / carer's leave — NOT paid out",
      description:
        "Personal leave is not paid on termination under NES s.101. Documented here so payroll doesn't accidentally include it.",
      category: "leave",
      isRequired: true,
    },
    {
      title: "Long Service Leave payout (state-specific)",
      description:
        "NSW: 5+ years continuous service = pro-rata payout. VIC: 7+ years (some cases 5). QLD: 7+ years. Check the state LSL Act.",
      category: "leave",
      isRequired: false,
    },
    {
      title: "Process final pay in EH (within 7 days — MA000120 cl 15)",
      category: "final_pay",
      isRequired: true,
    },
    // ── Super
    {
      title: "Confirm final super in next quarterly SG batch",
      description:
        "SG paid quarterly, 28 days after quarter end. Confirm final pay's SG contribution is queued for the next batch.",
      category: "super",
      isRequired: true,
    },
    // ── Equipment
    {
      title: "Return uniform, ID badge, keys",
      category: "equipment",
      isRequired: true,
    },
    {
      title: "Return centre iPad, laptop, or issued equipment",
      category: "equipment",
      isRequired: false,
    },
    {
      title: "Return company credit card / fuel card (if issued)",
      category: "equipment",
      isRequired: false,
    },
    // ── Access
    {
      title: "Deactivate dashboard account (auto on Separation finalise)",
      category: "access",
      isRequired: true,
    },
    {
      title: "Deactivate OWNA educator profile",
      category: "access",
      isRequired: true,
    },
    {
      title: "Deactivate kiosk PIN (clock-in)",
      category: "access",
      isRequired: true,
    },
    {
      title: "Revoke Employment Hero access",
      category: "access",
      isRequired: true,
    },
    {
      title: "Revoke Xero / accounting access (if applicable)",
      category: "access",
      isRequired: false,
    },
    {
      title: "Remove from WhatsApp and staff comms groups",
      category: "access",
      isRequired: true,
    },
    {
      title: "Remove from all email distribution lists",
      category: "access",
      isRequired: true,
    },
    {
      title: "Deactivate Google Workspace / Microsoft 365 account",
      category: "access",
      isRequired: false,
    },
    // ── Handover
    {
      title: "Written handover document completed and signed off",
      description:
        "Handover of active projects, key contacts, pending decisions, credentials for services not yet transferred. Signed off by manager.",
      category: "handover",
      isRequired: true,
    },
    {
      title: "Introduce replacement or handover recipient",
      category: "handover",
      isRequired: false,
    },
    {
      title: "Update Weekly Roster (remove upcoming shifts)",
      category: "handover",
      isRequired: true,
    },
    {
      title: "Update centre org chart / Accountability Chart",
      category: "handover",
      isRequired: true,
    },
    {
      title: "Update emergency contact / centre lists",
      category: "handover",
      isRequired: true,
    },
    // ── Letters
    {
      title: "Statement of Service issued (mandatory on request)",
      description:
        "Fair Work requires this on written request within a reasonable time. Include dates of employment, position(s), average weekly hours, gross weekly pay.",
      category: "letter",
      isRequired: true,
    },
    {
      title: "Reference letter prepared (optional)",
      description:
        "Standard template. Not legally required but expected. Only prepare if rehire-eligible or the reason permits a positive framing.",
      category: "letter",
      isRequired: false,
    },
    // ── Regulatory
    {
      title: "ACECQA Reg 175 notification (if certified/nominated supervisor)",
      description:
        "If the departing staff was a Certified Supervisor or Nominated Supervisor, the service must notify the state regulator within 7 days under Regulation 175 of the Education and Care Services National Regulations.",
      category: "regulatory",
      isRequired: false,
    },
    {
      title: "WWCC body notification (dismissal for child-safety cause)",
      description:
        "If the dismissal was for conduct involving a child, notify the state WWCC body (NSW OCG / VIC DGCS / QLD Blue Card / etc.) — failure to notify puts your service approval at risk.",
      category: "regulatory",
      isRequired: false,
    },
    {
      title: "Update NQF Reg 145–148 registers (exit date)",
      description:
        "Staff, Supervisor, and Volunteer registers require the exit date. Should flow from the Separation record automatically — verify.",
      category: "regulatory",
      isRequired: true,
    },
    // ── Records
    {
      title: "Archive employment records (7-year retention — Fair Work Reg 3.44)",
      description:
        "Retain contract, timesheets, pay records, super records, leave records, WWCC copies, and disciplinary records for 7 years after employment ends.",
      category: "records",
      isRequired: true,
    },
    {
      title: "Archive child-safety incident records separately (if applicable)",
      description:
        "If any incidents involving children were logged against this staff member, archive per state child-safety-record rules — often longer than 7 years.",
      category: "records",
      isRequired: false,
    },
    // ── Exit
    {
      title: "Structured exit interview completed",
      description:
        "Cover reason for leaving, satisfaction ratings (management, pay, workload, culture), top-3 reasons, would-you-return, feedback for improvement.",
      category: "exit_interview",
      isRequired: true,
    },
    {
      title: "Update rehire eligibility flag on Separation record",
      category: "exit_interview",
      isRequired: true,
    },
  ],
};

const PACKS: PackSpec[] = [CASUAL_PACK, PERMANENT_PACK];

export const POST = withApiAuth(async (_req, session) => {
  if (session!.user.role !== "owner" && session!.user.role !== "admin") {
    return NextResponse.json({ error: "Owner or admin required" }, { status: 403 });
  }
  try {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const spec of PACKS) {
      const existing = await prisma.offboardingPack.findFirst({
        where: { name: spec.name, deleted: false },
      });
      if (existing) {
        skipped.push(spec.name);
        continue;
      }
      await prisma.offboardingPack.create({
        data: {
          name: spec.name,
          description: spec.description,
          isDefault: spec.isDefault,
          applicableEmploymentTypes: spec.applicableEmploymentTypes,
          tasks: {
            create: spec.tasks.map((t, i) => ({
              title: t.title,
              description: t.description ?? null,
              category: t.category,
              sortOrder: i + 1,
              isRequired: t.isRequired,
            })),
          },
        },
      });
      created.push(spec.name);
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${created.length} pack(s), skipped ${skipped.length} existing`,
      created,
      skipped,
    });
  } catch (err) {
    logger.error("Offboarding seed error", { err });
    return NextResponse.json(
      { error: "Failed to seed offboarding packs" },
      { status: 500 },
    );
  }
});
