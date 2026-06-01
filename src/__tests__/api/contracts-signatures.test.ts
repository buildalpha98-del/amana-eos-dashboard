/**
 * Tests for the two-party signature flow on contracts.
 *
 * Critical paths:
 *   - acknowledge without signature still works (legacy / opt-in)
 *   - acknowledge with signature stores the data URL
 *   - acknowledge with signature + template triggers PDF re-render
 *   - PDF re-render failure is non-fatal — signature still saved
 *   - oversize signature data URL → 400
 *   - non-data-URL signature value → 400
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Default the PDF render path to "succeeded" so the happy-path tests
// don't need to wire it; individual tests can override for failure
// cases.
vi.mock("@/lib/pdf/render-contract", () => ({
  renderContractPdf: vi.fn(() => Promise.resolve(Buffer.from("fake-pdf"))),
}));
vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://blob/regen.pdf" })),
}));

import { POST } from "@/app/api/contracts/[id]/acknowledge/route";
import { renderContractPdf } from "@/lib/pdf/render-contract";
import { uploadFile } from "@/lib/storage";
import { _clearUserActiveCache } from "@/lib/server-auth";

const baseContract = {
  id: "c-1",
  userId: "u-1",
  contractType: "ct_permanent",
  acknowledgedByStaff: false,
  templateId: null,
  template: null,
  templateValues: null,
  adminSignatureDataUrl: null,
  documentUrl: "https://blob/original.pdf",
};

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
  prismaMock.onboardingPack.findFirst.mockResolvedValue(null);
});

describe("POST /api/contracts/[id]/acknowledge — signature flow", () => {
  it("accepts an empty-body POST (legacy / no-signature path)", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(baseContract);
    prismaMock.employmentContract.update.mockResolvedValue({
      ...baseContract,
      acknowledgedByStaff: true,
    });

    const res = await POST(
      createRequest("POST", "/api/contracts/c-1/acknowledge"),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.employmentContract.update.mock.calls[0]?.[0];
    expect(updateCall?.data.staffSignatureDataUrl).toBeNull();
  });

  it("rejects an oversize signature payload (>500KB)", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    const huge = "data:image/png;base64," + "A".repeat(500_001);

    const res = await POST(
      createRequest("POST", "/api/contracts/c-1/acknowledge", {
        body: { staffSignatureDataUrl: huge },
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects a signature value that isn't a data URL", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });

    const res = await POST(
      createRequest("POST", "/api/contracts/c-1/acknowledge", {
        body: { staffSignatureDataUrl: "https://example.com/sig.png" },
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("stores staff signature when no template attached (no re-render)", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(baseContract);
    prismaMock.employmentContract.update.mockResolvedValue({
      ...baseContract,
      acknowledgedByStaff: true,
      staffSignatureDataUrl: TINY_PNG_DATA_URL,
    });

    const res = await POST(
      createRequest("POST", "/api/contracts/c-1/acknowledge", {
        body: { staffSignatureDataUrl: TINY_PNG_DATA_URL },
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(res.status).toBe(200);
    expect(renderContractPdf).not.toHaveBeenCalled();
    const updateCall = prismaMock.employmentContract.update.mock.calls[0]?.[0];
    expect(updateCall?.data.staffSignatureDataUrl).toBe(TINY_PNG_DATA_URL);
    expect(updateCall?.data.documentUrl).toBeUndefined();
  });

  it("re-renders PDF when staff signs a template-based contract", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      ...baseContract,
      templateId: "tpl-1",
      template: {
        id: "tpl-1",
        contentJson: { type: "doc", content: [] },
      },
      templateValues: { auto: {}, manual: {} },
      adminSignatureDataUrl: "data:image/png;base64,admin",
    });
    prismaMock.employmentContract.update.mockResolvedValue({
      ...baseContract,
      acknowledgedByStaff: true,
    });

    const res = await POST(
      createRequest("POST", "/api/contracts/c-1/acknowledge", {
        body: { staffSignatureDataUrl: TINY_PNG_DATA_URL },
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(res.status).toBe(200);
    expect(renderContractPdf).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    const updateCall = prismaMock.employmentContract.update.mock.calls[0]?.[0];
    // Re-rendered URL should land on the row
    expect(updateCall?.data.documentUrl).toBe("https://blob/regen.pdf");
  });

  it("re-render failure is non-fatal — signature still saved", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      ...baseContract,
      templateId: "tpl-1",
      template: { id: "tpl-1", contentJson: { type: "doc", content: [] } },
      templateValues: { auto: {}, manual: {} },
      adminSignatureDataUrl: null,
    });
    prismaMock.employmentContract.update.mockResolvedValue({
      ...baseContract,
      acknowledgedByStaff: true,
    });
    // Force renderContractPdf to blow up
    (renderContractPdf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("puppeteer crashed"),
    );

    const res = await POST(
      createRequest("POST", "/api/contracts/c-1/acknowledge", {
        body: { staffSignatureDataUrl: TINY_PNG_DATA_URL },
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.employmentContract.update.mock.calls[0]?.[0];
    // Signature saved
    expect(updateCall?.data.staffSignatureDataUrl).toBe(TINY_PNG_DATA_URL);
    // documentUrl NOT touched — original blob URL must survive
    expect(updateCall?.data.documentUrl).toBeUndefined();
    // And the contract is still marked signed
    expect(updateCall?.data.acknowledgedByStaff).toBe(true);
  });
});
