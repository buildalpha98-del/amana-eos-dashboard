import { NextRequest, NextResponse } from "next/server";
import { getResend, FROM_EMAIL } from "@/lib/email";
import {
  todoReminderEmail,
  ticketNotificationEmail,
  welcomeEmail,
} from "@/lib/email-templates";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api-error";

const bodySchema = z.object({
  type: z.enum(["todo-reminder", "ticket-notification", "welcome"]),
  payload: z.record(z.string(), z.any()),
});

type EmailType = "todo-reminder" | "ticket-notification" | "welcome";

export const POST = withApiAuth(async (req, session) => {
  // Only admins and owners can trigger emails
  if (!["admin", "owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { type, payload } = parsed.data as { type: EmailType; payload: Record<string, unknown> };

  const resend = getResend();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") console.log(`[DEV] Would send ${type} email:`, payload);
    return NextResponse.json({ message: "Email logged (dev mode — no RESEND_API_KEY)" });
  }

  let emailContent: { subject: string; html: string };
  let to: string;

  switch (type) {
    case "todo-reminder": {
      const { name, email, todos, dashboardUrl } = payload as {
        name: string;
        email: string;
        todos: { title: string; dueDate: string }[];
        dashboardUrl: string;
      };
      emailContent = todoReminderEmail(name, todos, dashboardUrl);
      to = email;
      break;
    }

    case "ticket-notification": {
      const { name, email, ticket, ticketUrl } = payload as {
        name: string;
        email: string;
        ticket: { title: string; priority: string; raisedBy?: string };
        ticketUrl: string;
      };
      emailContent = ticketNotificationEmail(name, ticket, ticketUrl);
      to = email;
      break;
    }

    case "welcome": {
      const { name, email, tempPassword, loginUrl } = payload as {
        name: string;
        email: string;
        tempPassword: string;
        loginUrl: string;
      };
      emailContent = welcomeEmail(name, tempPassword, loginUrl);
      to = email;
      break;
    }

    default:
      return NextResponse.json(
        { error: `Unknown email type: ${type}` },
        { status: 400 }
      );
  }

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: emailContent.subject,
    html: emailContent.html,
  });

  return NextResponse.json({ message: "Email sent", id: result.data?.id });
});
