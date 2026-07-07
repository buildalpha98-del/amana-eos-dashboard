import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { applyNotificationMute, MUTE_SUPPRESSION_REASON } from "@/lib/notification-mute";

describe("applyNotificationMute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cameron's real case — an eos_viewer (falls to the default prefs on unmute).
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "Cam@Example.com", role: "eos_viewer" });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.emailSuppression.upsert.mockResolvedValue({});
    prismaMock.emailSuppression.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("mute: suppresses email (lowercased, manual_mute), clears push, sets flag + prefs all-off", async () => {
    const { email } = await applyNotificationMute("u1", true);
    expect(email).toBe("Cam@Example.com");

    const supp = prismaMock.emailSuppression.upsert.mock.calls[0][0];
    expect(supp.where.email).toBe("cam@example.com");
    expect(supp.create.reason).toBe(MUTE_SUPPRESSION_REASON);

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });

    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.notificationsMuted).toBe(true);
    expect(upd.data.notificationPrefs.emailNotifications).toBe(false);
    expect(upd.data.notificationPrefs.newAssignments).toBe(false);
    expect(upd.data.notificationPrefs.announcements).toBe(false);
  });

  it("unmute: lifts ONLY the manual suppression (never a real bounce), resets prefs + flag false", async () => {
    await applyNotificationMute("u1", false);

    // suppression removal is scoped to our manual reason
    const del = prismaMock.emailSuppression.deleteMany.mock.calls[0][0];
    expect(del.where.email).toBe("cam@example.com");
    expect(del.where.reason).toBe(MUTE_SUPPRESSION_REASON);
    // push is NOT re-created on unmute
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();

    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.notificationsMuted).toBe(false);
    // role defaults restored (valid object), not all-off
    expect(upd.data.notificationPrefs.emailNotifications).toBe(true);
  });

  it("throws when the user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(applyNotificationMute("nope", true)).rejects.toThrow("User not found");
  });
});
