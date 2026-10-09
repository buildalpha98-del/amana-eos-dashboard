/**
 * Configure → Settings → Families & app (2026-10-09): the sign in / out
 * notices obey the centre's switches.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

const sends = vi.hoisted(() => ({
  email: vi.fn(() => Promise.resolve()),
  push: vi.fn(() => Promise.resolve()),
  bell: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/notifications/sendEmail", () => ({ sendNotificationEmail: sends.email }));
vi.mock("@/lib/push/webPush", () => ({ sendPushToParentEmail: sends.push }));
vi.mock("@/lib/parent-notifications", () => ({ createInAppNotification: sends.bell }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { sendSignInNotification, sendSignOutNotification } from "@/lib/notifications/attendance";
import { resolveAppSettings } from "@/lib/app-settings";

function centre(parents?: Record<string, boolean>) {
  prismaMock.service.findUnique.mockResolvedValue({ name: "Greenacre", appSettings: parents ? { parents } : null });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.child.findUnique.mockImplementation((args: { select: Record<string, unknown> }) =>
    Promise.resolve(
      "enrolment" in args.select
        ? { enrolment: { primaryParent: { email: "mum@example.com", firstName: "Mariam" } } }
        : { firstName: "Adam", surname: "Test" },
    ),
  );
});

describe("sign in / out notices", () => {
  it("default: app notice, push and email, as before", async () => {
    centre();
    await sendSignInNotification("c1", "svc1", new Date());
    expect(sends.bell).toHaveBeenCalledOnce();
    expect(sends.email).toHaveBeenCalledOnce();
    expect(sends.push).toHaveBeenCalledOnce();
  });

  it("emails off: app notice only", async () => {
    centre({ attendanceEmails: false });
    await sendSignOutNotification("c1", "svc1", new Date());
    expect(sends.bell).toHaveBeenCalledOnce();
    expect(sends.email).not.toHaveBeenCalled();
  });

  it("notices off: nothing at all, email switch notwithstanding", async () => {
    centre({ attendanceNotifications: false, attendanceEmails: true });
    await sendSignInNotification("c1", "svc1", new Date());
    expect(sends.bell).not.toHaveBeenCalled();
    expect(sends.email).not.toHaveBeenCalled();
    expect(sends.push).not.toHaveBeenCalled();
  });

  it("both default on", () => {
    expect(resolveAppSettings(null).parents).toMatchObject({
      attendanceNotifications: true,
      attendanceEmails: true,
    });
  });
});
