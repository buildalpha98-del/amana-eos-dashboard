/**
 * PUT /api/my-portal/payroll/bank — change the account the signed-in staff
 * member is paid into. Written straight to Employment Hero (their main /
 * "balance" account; any splits they set up in EH are left alone) and
 * never stored here.
 *
 * Redirecting someone's pay is a classic account-takeover fraud, so every
 * change is audited, emailed to the account owner — if it wasn't them,
 * they find out before payday — and flagged to every owner (in-app + email,
 * Daniel's request 2026-10-07). Tight rate limit for the same reason.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { EhPayrollError, isConfigured, saveMainBankAccount } from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { bankAccountInputSchema, maskBankAccount, maskAccountNumber } from "@/lib/payroll-details";
import { logAuditEvent } from "@/lib/audit-log";
import { sendEmail } from "@/lib/email";
import { baseLayout } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

/** Every active owner hears about a bank change — never blocks the save. */
async function alertOwners(input: { staffUserId: string; staffName: string; last3: string }) {
  try {
    const owners = await prisma.user.findMany({
      where: { role: "owner", active: true, isCentreAccount: false, id: { not: input.staffUserId } },
      select: { id: true, email: true },
    });
    if (owners.length === 0) return;
    const body = `${input.staffName} changed the bank account their pay goes into (now ending ${input.last3}).`;
    await notifyUsers(prisma, owners.map((o) => o.id), {
      type: NOTIFICATION_TYPES.PAYROLL_BANK_CHANGED,
      title: "Pay account changed",
      body,
      link: `/staff/${input.staffUserId}`,
    });
    await sendEmail({
      to: owners.map((o) => o.email),
      subject: `Pay account changed — ${input.staffName}`,
      html: baseLayout(
        `<h2 style="margin:0 0 12px;">A staff member changed their pay account</h2>
         <p>${escapeHtml(body)}</p>
         <p>It's already saved in Employment Hero. If it doesn't look right — especially just before
         a pay run — check with them directly (not by replying to an email from that account).</p>`,
        "staff",
      ),
    });
  } catch (err) {
    logger.error("Bank change owner alert failed", { err, staffUserId: input.staffUserId });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const PUT = withApiAuth(
  async (req, session) => {
    if (!isConfigured()) throw new ApiError(503, "Payroll isn't connected yet");
    const employeeId = await requireOwnEmployee(session!);

    const parsed = bankAccountInputSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    let saved;
    try {
      saved = await saveMainBankAccount(employeeId, parsed.data);
    } catch (err) {
      if (err instanceof EhPayrollError && err.status >= 400 && err.status < 500) {
        throw ApiError.badRequest("Employment Hero didn't accept those details — check the BSB and account number.");
      }
      throw err;
    }

    logAuditEvent(
      {
        action: "payroll.bank_account_changed",
        actorId: session!.user.id,
        actorEmail: session!.user.email,
        targetId: session!.user.id,
        targetType: "User",
        // Masked only — the full number never reaches our logs.
        metadata: {
          ehEmployeeId: employeeId,
          to: maskAccountNumber(parsed.data.accountNumber),
          from: saved.previous ? maskAccountNumber(saved.previous.accountNumber) : null,
        },
      },
      req,
    );

    if (session!.user.email) {
      await sendEmail({
        to: session!.user.email,
        subject: "Your pay account was changed",
        html: baseLayout(
          `<h2 style="margin:0 0 12px;">Your bank details were updated</h2>
           <p>The account your Amana OSHC pay goes into was just changed to the account ending
           <strong>${maskAccountNumber(parsed.data.accountNumber).replace("•••• ", "")}</strong>.</p>
           <p>If this was you, there's nothing else to do.</p>
           <p><strong>If it wasn't you</strong>, reply to this email or call your manager straight away
           so we can stop the change before payday.</p>`,
          "staff",
        ),
      }).catch((err) => logger.error("Bank change alert email failed", { err }));
    }

    await alertOwners({
      staffUserId: session!.user.id,
      staffName: session!.user.name ?? session!.user.email ?? "A staff member",
      last3: maskAccountNumber(parsed.data.accountNumber).replace("•••• ", ""),
    });

    return NextResponse.json({ account: maskBankAccount(saved.account), warning: saved.warning });
  },
  { rateLimit: { max: 5, windowMs: 15 * 60 * 1000 } },
);
