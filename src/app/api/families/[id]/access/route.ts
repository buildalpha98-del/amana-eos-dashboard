/**
 * POST /api/families/:id/access — help a family get back into the portal.
 *
 * Three actions behind one route, because they are one job from the desk's
 * point of view: a parent rings up locked out, and staff need to unstick them
 * while still on the phone.
 *
 *   send_reset  — email them a link to choose a new password (the default)
 *   send_login  — email them a one-time sign-in link, for someone who just
 *                 can't find their way back in rather than having forgotten
 *   set_password — set one directly and read it out, for the parent who can't
 *                 receive our email at all
 *
 * `set_password` is owner/admin only and audited by name. It is the exception,
 * not the convenience: staff knowing a family's password is a thing to reach
 * for when email has failed, not the everyday path — which is why the response
 * to the other two says plainly what was sent and to where.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getResend, FROM_EMAIL } from "@/lib/email";
import {
  createParentPasswordReset,
  parentResetUrl,
  setParentPasswordDirect,
} from "@/lib/parent-password-reset";
import {
  parentPasswordResetEmail,
  parentMagicLinkEmail,
} from "@/lib/email-templates/parent-portal";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send_reset") }),
  z.object({ action: z.literal("send_login") }),
  z.object({
    action: z.literal("set_password"),
    password: z.string().min(10),
  }),
]);

/** Login links last an hour, same as resets — see send-link's own note. */
const MAGIC_TTL_MS = 60 * 60 * 1000;

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Password must be at least 10 characters.",
        parsed.error.flatten(),
      );
    }
    const body = parsed.data;

    const account = await prisma.parentAccount.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        deactivatedAt: true,
      },
    });
    if (!account) throw ApiError.notFound("Family account not found");

    // Staff see the state on screen, so unlike the public routes this one says
    // what's wrong rather than silently doing nothing.
    if (account.deactivatedAt) {
      throw ApiError.badRequest(
        "This family's portal access is switched off. Switch it back on first — a new password won't let them in while it is.",
      );
    }

    const role = session!.user.role;

    if (body.action === "set_password") {
      if (role !== "owner" && role !== "admin") {
        throw ApiError.forbidden(
          "Only an owner or admin can set a family's password directly. Send them a reset link instead.",
        );
      }

      await setParentPasswordDirect({
        accountId: account.id,
        password: body.password,
      });

      // The password itself is NEVER logged — only that it was set, by whom.
      await prisma.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "parent_password_set",
          entityType: "ParentAccount",
          entityId: account.id,
          details: { email: account.email },
        },
      });
      logger.info("Staff set a family's password", {
        accountId: account.id,
        byUserId: session!.user.id,
      });

      return NextResponse.json({ ok: true, email: account.email });
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";
    const name = account.firstName || "there";

    let subject: string;
    let html: string;

    if (body.action === "send_reset") {
      const { token } = await createParentPasswordReset(account.email, {
        issuedByUserId: session!.user.id,
      });
      ({ subject, html } = await parentPasswordResetEmail(
        name,
        parentResetUrl(baseUrl, token),
        { byStaff: true },
      ));
    } else {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.parentMagicLink.create({
        data: {
          email: account.email,
          tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + MAGIC_TTL_MS),
        },
      });
      ({ subject, html } = await parentMagicLinkEmail(
        name,
        `${baseUrl}/api/parent/auth/verify?token=${token}`,
      ));
    }

    /**
     * Sent through Resend directly rather than `sendEmail`, matching the two
     * public recovery routes: that wrapper drops suppressed addresses, and a
     * bounce or newsletter unsubscribe must not be why a family can't get back
     * into their own account. Staff asked for this send explicitly.
     */
    const resend = getResend();
    if (!resend) {
      if (process.env.NODE_ENV !== "production") {
        logger.warn("Family access email not sent: email is not configured", {
          accountId: account.id,
        });
        return NextResponse.json({ ok: true, email: account.email, dev: true });
      }
      throw new ApiError(
        503,
        "Email isn't configured, so nothing was sent. Set a password directly instead.",
      );
    }

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: account.email,
      subject,
      html,
    });

    // Unlike the public routes, staff DO need to know when a send failed —
    // they are standing there telling a parent to check their inbox.
    if (error) {
      logger.error("Family access email rejected by provider", {
        accountId: account.id,
        error: error.message,
      });
      throw new ApiError(
        502,
        `Couldn't send to ${account.email}: ${error.message}`,
      );
    }

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action:
          body.action === "send_reset"
            ? "parent_password_reset_sent"
            : "parent_login_link_sent",
        entityType: "ParentAccount",
        entityId: account.id,
        details: { email: account.email },
      },
    });

    return NextResponse.json({ ok: true, email: account.email });
  },
  { roles: ["owner", "head_office", "admin"] },
);
