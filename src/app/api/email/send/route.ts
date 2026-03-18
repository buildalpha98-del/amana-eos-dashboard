import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getResend, FROM_EMAIL } from "@/lib/email";
import {
  todoReminderEmail,
  ticketNotificationEmail,
  welcomeEmail,
} from "@/lib/email-templates";

type EmailType = "todo-reminder" | "ticket-notification" | "welcome";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins and owners can trigger emails
    if (!["admin", "owner"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { type, payload } = body as { type: EmailType; payload: Record<string, unknown> };

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
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
