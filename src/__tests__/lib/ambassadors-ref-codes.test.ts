import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  REF_CODE_CHARSET,
  ensureRefCodesForPilot,
  generateRefCode,
  signupUrlForCode,
} from "@/lib/ambassadors/ref-codes";

describe("generateRefCode", () => {
  it("is 6 chars from the unambiguous charset (no 0/O/1/I/L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRefCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(REF_CODE_CHARSET).toContain(ch);
    }
    expect(REF_CODE_CHARSET).not.toMatch(/[0O1IL]/);
  });
});

describe("signupUrlForCode", () => {
  it("points at /parent/signup with the ref query param", () => {
    expect(signupUrlForCode("ABC234")).toMatch(/\/parent\/signup\?ref=ABC234$/);
  });
});

describe("ensureRefCodesForPilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ambassadorPilotCentre.findMany.mockResolvedValue([
      { serviceId: "svc-1" },
    ]);
    prismaMock.educatorRefCode.findUnique.mockResolvedValue(null);
    prismaMock.qrCode.findUnique.mockResolvedValue(null); // shortCode collision check
    prismaMock.qrCode.create.mockResolvedValue({ id: "qr-1" });
    prismaMock.educatorRefCode.create.mockResolvedValue({ id: "ref-1" });
  });

  it("creates codes + linked QRs for users without one, skips users with one", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Aisha Rahman", serviceId: "svc-1", educatorRefCode: null },
      { id: "u-2", name: "Bilal Khan", serviceId: "svc-1", educatorRefCode: { id: "existing" } },
    ]);

    const result = await ensureRefCodesForPilot("pilot-1");

    expect(result).toEqual({ created: 1, existing: 1 });
    expect(prismaMock.qrCode.create).toHaveBeenCalledTimes(1);
    const qrData = prismaMock.qrCode.create.mock.calls[0][0].data;
    expect(qrData.shortCode).toBeTruthy();
    expect(qrData.destinationUrl).toContain("/parent/signup?ref=");
    expect(prismaMock.educatorRefCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u-1", qrCodeId: "qr-1" }),
      }),
    );
  });

  it("no-ops when the pilot has no centres", async () => {
    prismaMock.ambassadorPilotCentre.findMany.mockResolvedValue([]);
    const result = await ensureRefCodesForPilot("pilot-1");
    expect(result).toEqual({ created: 0, existing: 0 });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
