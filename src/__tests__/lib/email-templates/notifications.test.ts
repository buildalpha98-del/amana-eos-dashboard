import { describe, it, expect } from "vitest";
import {
  todoAssignedEmail,
  rockAssignedEmail,
  issueAssignedEmail,
  todoReminderEmail,
  ticketNotificationEmail,
  notificationDigestEmail,
  smartDigestEmail,
  openShiftPostedEmail,
} from "@/lib/email-templates/notifications";

// Titles come from POST endpoints open to every authenticated role
// (/api/todos, /api/issues, /api/rocks), so anything a staff member types
// lands in the assignee's inbox. These tests pin the escaping contract.
const XSS_TITLE = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = "&lt;img src=x onerror=alert(1)&gt;";
const DASHBOARD_URL = "https://amanaoshc.company/todos";

describe("assignment email escaping", () => {
  it("todoAssignedEmail escapes an HTML-injection todo title", async () => {
    const { html } = await todoAssignedEmail("Tracie", XSS_TITLE, "Daniel", DASHBOARD_URL);
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("rockAssignedEmail escapes an HTML-injection rock title", async () => {
    const { html } = await rockAssignedEmail("Tracie", XSS_TITLE, "Daniel", DASHBOARD_URL);
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("issueAssignedEmail escapes an HTML-injection issue title", async () => {
    const { html } = await issueAssignedEmail("Tracie", XSS_TITLE, "Daniel", DASHBOARD_URL);
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("escapes assignee and assigner names", async () => {
    const { html } = await todoAssignedEmail(
      "<b>Evil</b>",
      "Order supplies",
      '"><a href="https://phish.example">Daniel</a>',
      DASHBOARD_URL,
    );
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(html).not.toContain('<a href="https://phish.example">');
  });

  it("keeps the trusted viewButton CTA as real HTML", async () => {
    const { html } = await todoAssignedEmail("Tracie", XSS_TITLE, "Daniel", DASHBOARD_URL);
    expect(html).toContain(`<a href="${DASHBOARD_URL}"`);
    expect(html).toContain("View To-Dos");
  });

  it("renders plain titles unchanged (ampersand aside)", async () => {
    const { html } = await todoAssignedEmail("Tracie", "Order art & craft supplies", "Daniel", DASHBOARD_URL);
    expect(html).toContain("Order art &amp; craft supplies");
  });
});

describe("other notification templates escape user content", () => {
  it("todoReminderEmail escapes todo titles", () => {
    const { html } = todoReminderEmail(
      "Tracie",
      [{ title: XSS_TITLE, dueDate: "12/08/2026" }],
      DASHBOARD_URL,
    );
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("ticketNotificationEmail escapes ticket title and raisedBy in the HTML body", () => {
    const { html } = ticketNotificationEmail(
      "Tracie",
      { title: XSS_TITLE, priority: "high", raisedBy: "<i>spoof</i>" },
      DASHBOARD_URL,
    );
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain("<i>spoof</i>");
  });

  it("notificationDigestEmail escapes item messages (which embed titles)", () => {
    const { html } = notificationDigestEmail(
      "Tracie",
      [
        {
          type: "overdue_todo",
          severity: "warning",
          title: "Overdue To-Do",
          message: `"${XSS_TITLE}" assigned to Daniel was due 12/08/2026`,
          link: "/todos",
        },
      ],
      DASHBOARD_URL,
    );
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("smartDigestEmail escapes AI insight strings", () => {
    const { html } = smartDigestEmail(
      "Tracie",
      { overdueTodos: 1, offTrackRocks: 0, expiringCerts: 0, unreadAnnouncements: 0 },
      [XSS_TITLE],
      DASHBOARD_URL,
    );
    expect(html).not.toContain(XSS_TITLE);
    expect(html).toContain(XSS_ESCAPED);
  });

  it("openShiftPostedEmail escapes service name and role", () => {
    const { html } = openShiftPostedEmail(
      "Tracie",
      "<script>alert(1)</script>",
      [{ date: "2026-08-10", sessionType: "asc", shiftStart: "15:00", shiftEnd: "18:00", role: "<b>Lead</b>" }],
      DASHBOARD_URL,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<b>Lead</b>");
  });
});
