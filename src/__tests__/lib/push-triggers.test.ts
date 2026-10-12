/**
 * Integration tests verifying each notification helper fires the correct
 * push send. Covers the four user-facing events we promise push for:
 *   1. child signed in / signed out
 *   2. new message from centre
 *   3. new post about their kid
 *   4. booking status change
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// ─── Mock out side-effects so we can focus on the push call ──────────────

vi.mock("@/lib/push/webPush", () => ({
  sendPushToParentEmail: vi.fn().mockResolvedValue({ sent: 1, removed: 0 }),
  sendPushToContact: vi.fn().mockResolvedValue({ sent: 1, removed: 0 }),
}));

vi.mock("@/lib/notifications/sendEmail", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  FROM_EMAIL: "test@example.com",
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { sendPushToParentEmail, sendPushToContact } from "@/lib/push/webPush";
import {
  sendSignInNotification,
  sendSignOutNotification,
} from "@/lib/notifications/attendance";
import {
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyParentNewPost,
} from "@/lib/parent-notifications";
import { sendNewMessageNotification } from "@/lib/notifications/messaging";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";

const mockedSendPushToParentEmail = vi.mocked(sendPushToParentEmail);
const mockedSendPushToContact = vi.mocked(sendPushToContact);

// Lets us wait for fire-and-forget sendPush* calls that aren't awaited.
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("attendance push triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.child.findUnique.mockResolvedValue({
      firstName: "Ayla",
      surname: "Kowaider",
      enrolment: { primaryParent: { email: "parent@x.com", firstName: "Jay" } },
    });
    prismaMock.service.findUnique.mockResolvedValue({ name: "Fitzroy North" });
  });

  it("fires a sign-in push with child + service + time", async () => {
    const when = new Date("2026-04-24T07:30:00+10:00");
    await sendSignInNotification("child-1", "svc-1", when);
    await flush();
    expect(mockedSendPushToParentEmail).toHaveBeenCalledTimes(1);
    const [email, payload] = mockedSendPushToParentEmail.mock.calls[0];
    expect(email).toBe("parent@x.com");
    expect(payload.title).toContain("Ayla");
    expect(payload.body).toContain("Fitzroy North");
    expect(payload.url).toBe("/parent/children/child-1");
  });

  it("fires a sign-out push", async () => {
    const when = new Date("2026-04-24T15:30:00+10:00");
    await sendSignOutNotification("child-1", "svc-1", when);
    await flush();
    expect(mockedSendPushToParentEmail).toHaveBeenCalledTimes(1);
    const payload = mockedSendPushToParentEmail.mock.calls[0][1];
    expect(payload.title.toLowerCase()).toContain("signed out");
  });
});

describe("booking push triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockBooking(overrides: Record<string, unknown> = {}) {
    prismaMock.booking.findUnique.mockResolvedValue({
      date: new Date("2026-04-24"),
      sessionType: "asc",
      child: {
        firstName: "Ayla",
        enrolment: {
          primaryParent: { email: "parent@x.com", firstName: "Jay" },
        },
      },
      service: { name: "Fitzroy North" },
      ...overrides,
    });
  }

  it("fires a push when a booking is confirmed", async () => {
    mockBooking();
    await notifyBookingConfirmed("booking-1");
    await flush();
    expect(mockedSendPushToParentEmail).toHaveBeenCalledTimes(1);
    const [email, payload] = mockedSendPushToParentEmail.mock.calls[0];
    expect(email).toBe("parent@x.com");
    expect(payload.title.toLowerCase()).toContain("confirmed");
    expect(payload.url).toBe("/parent/bookings");
  });

  it("fires a push when a booking is cancelled", async () => {
    mockBooking();
    await notifyBookingCancelled("booking-1");
    await flush();
    expect(mockedSendPushToParentEmail).toHaveBeenCalledTimes(1);
    const payload = mockedSendPushToParentEmail.mock.calls[0][1];
    expect(payload.body).toContain("cancelled");
  });
});

describe("parent-post push trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires a push per unique parent email with the post title only", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      {
        firstName: "Ayla",
        enrolment: {
          primaryParent: { email: "a@x.com", firstName: "Jay" },
        },
      },
      {
        firstName: "Musa",
        enrolment: {
          primaryParent: { email: "a@x.com", firstName: "Jay" },
        },
      },
      {
        firstName: "Leo",
        enrolment: {
          primaryParent: { email: "b@x.com", firstName: "Sam" },
        },
      },
    ]);

    await notifyParentNewPost(
      "post-1",
      "Field trip photos",
      "observation",
      ["c1", "c2", "c3"],
    );
    await flush();

    // Deduped to two parent emails.
    expect(mockedSendPushToParentEmail).toHaveBeenCalledTimes(2);
    const emails = mockedSendPushToParentEmail.mock.calls.map((c) => c[0]);
    expect(emails.sort()).toEqual(["a@x.com", "b@x.com"]);

    // Push body should be the title, not the post contents.
    const payload = mockedSendPushToParentEmail.mock.calls[0][1];
    expect(payload.body).toBe("Field trip photos");
  });
});

describe("messaging push trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts the message itself in the email while the family app is closed", async () => {
    // PARENT_APP_OPEN is false: the parent can't open Messages, so the email
    // must carry the message and say how to reply.
    prismaMock.message.findUnique.mockResolvedValue({
      senderType: "staff",
      body: "Zayd left his <b>jumper</b> here today.",
      conversation: {
        id: "conv-1",
        subject: "Lost property",
        service: { id: "svc-1", name: "MFIS Greenacre", email: "mfisgreenacre@amanaoshc.com.au", phone: "0400 000 000" },
        family: { id: "contact-1", email: "parent@x.com", firstName: "Aysha", lastName: "K" },
      },
    });
    await sendNewMessageNotification("msg-1");
    await flush();
    const { html } = vi.mocked(sendNotificationEmail).mock.calls[0][0] as { html: string };
    expect(html).toContain("Zayd left his &lt;b&gt;jumper&lt;/b&gt; here today.");
    expect(html).toContain("mfisgreenacre@amanaoshc.com.au");
    expect(html).toContain("0400 000 000");
    expect(html).not.toContain("View Message");
  });

  it("fires a push to the parent's contactId when staff sends a new message", async () => {
    prismaMock.message.findUnique.mockResolvedValue({
      senderType: "staff",
      conversation: {
        id: "conv-1",
        subject: "Menu change",
        service: { id: "svc-1", name: "Fitzroy North" },
        family: {
          id: "contact-1",
          email: "parent@x.com",
          firstName: "Jay",
          lastName: "K",
        },
      },
    });

    await sendNewMessageNotification("msg-1");
    await flush();

    expect(mockedSendPushToContact).toHaveBeenCalledTimes(1);
    const [contactId, payload] = mockedSendPushToContact.mock.calls[0];
    expect(contactId).toBe("contact-1");
    expect(payload.title).toContain("Fitzroy North");
    // Subject only — don't leak message body.
    expect(payload.body).toBe("Menu change");
    expect(payload.url).toBe("/parent/messages/conv-1");
  });

  it("does NOT fire a parent push when the sender is a parent (message is for staff)", async () => {
    prismaMock.message.findUnique.mockResolvedValue({
      senderType: "parent",
      conversation: {
        id: "conv-1",
        subject: "Question",
        service: { id: "svc-1", name: "Fitzroy North" },
        family: { id: "contact-1", email: "p@x.com", firstName: "P", lastName: "K" },
      },
    });
    prismaMock.service.findUnique.mockResolvedValue({
      manager: { email: "coord@x.com", name: "Coord" },
      staffMembers: [],
    });

    await sendNewMessageNotification("msg-1");
    await flush();

    expect(mockedSendPushToContact).not.toHaveBeenCalled();
  });
});
