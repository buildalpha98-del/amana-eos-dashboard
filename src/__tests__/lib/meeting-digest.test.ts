import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmail(args),
}));

import { sendMeetingDigest } from "@/lib/meeting-digest";

const user = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `User ${id}`,
  email: `${id}@amanaoshc.com.au`,
  active: true,
  notificationsMuted: false,
  ...over,
});

const recording = {
  id: "rec-1",
  aiReview: {
    summary: "We talked about <things>.",
    decisions: [{ text: "Ship it", quote: "q" }],
    actionItems: [
      { id: "a1", status: "proposed", title: "Do X" },
      { id: "a2", status: "accepted", title: "Do Y", todoId: "t1" },
    ],
    missedItems: [],
    speakerMap: [],
  },
  meeting: {
    id: "m-1",
    title: "Leadership L10 <script>",
    date: new Date("2026-09-01T03:30:00Z"),
    cascades: [{ message: "New enrolment record!" }],
    attendees: [
      { user: user("u1") },
      { user: user("u2", { notificationsMuted: true }) },
      { user: user("u3", { active: false }) },
    ],
  },
};

describe("sendMeetingDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.meetingRecording.findUnique.mockResolvedValue(recording);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
    sendEmail.mockResolvedValue({ sent: ["u1@amanaoshc.com.au"], suppressed: [] });
  });

  it("claims digestSentAt before sending — second call no-ops", async () => {
    prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 0 });
    const result = await sendMeetingDigest("rec-1");
    expect(result.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();

    const claim = prismaMock.meetingRecording.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(claim.where).toEqual({ id: "rec-1", digestSentAt: null });
  });

  it("emails active+unmuted attendees; in-app goes to ALL active (muted kept)", async () => {
    const result = await sendMeetingDigest("rec-1");
    expect(result.sent).toBe(true);

    const emailArg = sendEmail.mock.calls[0][0] as { to: string[] };
    // u2 muted (no email), u3 inactive (nothing)
    expect(emailArg.to).toEqual(["u1@amanaoshc.com.au"]);

    const notifArg = prismaMock.userNotification.createMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string }>;
    };
    expect(notifArg.data.map((n) => n.userId).sort()).toEqual(["u1", "u2"]);
    expect(notifArg.data[0].type).toBe("meeting_review_ready");
  });

  it("escapes user-entered strings in the email html", async () => {
    await sendMeetingDigest("rec-1");
    const emailArg = sendEmail.mock.calls[0][0] as { html: string; subject: string };
    expect(emailArg.html).not.toContain("<script>");
    expect(emailArg.html).toContain("&lt;script&gt;");
    expect(emailArg.html).toContain("&lt;things&gt;");
    // proposed count surfaces
    expect(emailArg.html).toContain("1</strong> proposed action item");
    // cascades ride along
    expect(emailArg.html).toContain("New enrolment record!");
  });

  it("no-ops the email when every attendee is muted/inactive but still notifies in-app", async () => {
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      ...recording,
      meeting: {
        ...recording.meeting,
        attendees: [{ user: user("u2", { notificationsMuted: true }) }],
      },
    });
    const result = await sendMeetingDigest("rec-1");
    expect(result.sent).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("no-ops when the recording has no aiReview", async () => {
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      ...recording,
      aiReview: null,
    });
    const result = await sendMeetingDigest("rec-1");
    expect(result.sent).toBe(false);
  });
});
