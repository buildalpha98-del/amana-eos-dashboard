/**
 * POST /api/contracts/quick-upload — drag-and-drop backfill flow
 * for existing off-platform contracts (EH-era PDFs, scans, etc.).
 *
 * The route is dead-simple compared to the full /api/contracts POST:
 * just a userId + file. Defaults the new row to status=active +
 * acknowledged so the /team yellow "no contract" badge clears.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";

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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() =>
    Promise.resolve({ url: "https://blob.vercel.app/contract.pdf" }),
  ),
}));

import { POST } from "@/app/api/contracts/quick-upload/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function makePdfForm(opts: {
  userId?: string;
  fileType?: string;
  fileSize?: number;
  fileName?: string;
  omitFile?: boolean;
  omitUserId?: boolean;
}): FormData {
  const form = new FormData();
  if (!opts.omitUserId) {
    form.append("userId", opts.userId ?? "staff-1");
  }
  if (!opts.omitFile) {
    const size = opts.fileSize ?? 1024;
    const blob = new Blob([new Uint8Array(size)], {
      type: opts.fileType ?? "application/pdf",
    });
    form.append("file", blob, opts.fileName ?? "signed-contract.pdf");
  }
  return form;
}

function callPost(form: FormData) {
  // Built-in fetch Request supports a FormData body natively. The
  // route only reads `req.headers["content-type"]` and `req.formData()`,
  // both of which the Request object provides for us.
  const req = new Request("http://localhost/api/contracts/quick-upload", {
    method: "POST",
    body: form,
  });
  return POST(req as unknown as Parameters<typeof POST>[0], {
    params: Promise.resolve({}),
  });
}

describe("POST /api/contracts/quick-upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => {
        if (args.where.id === "staff-1") {
          return { id: "staff-1", name: "Staff", active: true };
        }
        if (args.where.id === "admin-1") {
          return { active: true };
        }
        return null;
      },
    );
    prismaMock.employmentContract.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "c-uploaded",
          ...args.data,
          user: {
            id: "staff-1",
            name: "Staff",
            email: "s@x.com",
            avatar: null,
          },
        }),
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it("creates the contract with active + acknowledged defaults", async () => {
    const res = await callPost(makePdfForm({}));
    expect(res.status).toBe(201);

    const createCall =
      prismaMock.employmentContract.create.mock.calls[0]?.[0];
    expect(createCall.data.status).toBe("active");
    expect(createCall.data.acknowledgedByStaff).toBe(true);
    expect(createCall.data.acknowledgedAt).toBeInstanceOf(Date);
    expect(createCall.data.signedAt).toBeInstanceOf(Date);
    expect(createCall.data.contractType).toBe("ct_permanent");
    expect(createCall.data.payRate).toBe(0);
    expect(createCall.data.documentUrl).toBe(
      "https://blob.vercel.app/contract.pdf",
    );
    expect(typeof createCall.data.notes).toBe("string");
    expect(createCall.data.notes).toContain("Imported");
  });

  it("rejects non-PDF files", async () => {
    const res = await callPost(makePdfForm({ fileType: "image/png" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/PDF/i);
  });

  it("rejects files over the size cap", async () => {
    const oversize = 11 * 1024 * 1024;
    const res = await callPost(makePdfForm({ fileSize: oversize }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it("rejects when userId is missing", async () => {
    const res = await callPost(makePdfForm({ omitUserId: true }));
    expect(res.status).toBe(400);
  });

  it("rejects when file is missing", async () => {
    const res = await callPost(makePdfForm({ omitFile: true }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target user doesn't exist", async () => {
    const res = await callPost(makePdfForm({ userId: "ghost" }));
    expect(res.status).toBe(404);
  });

  it("rejects non-admin viewers", async () => {
    mockSession({ id: "staff-self", name: "Self", role: "staff" });
    const res = await callPost(makePdfForm({}));
    expect(res.status).toBe(403);
  });

  it("writes an activity-log row tagged quick_upload_contract", async () => {
    await callPost(makePdfForm({}));
    const activityCall =
      prismaMock.activityLog.create.mock.calls[0]?.[0];
    expect(activityCall.data.action).toBe("quick_upload_contract");
    expect(activityCall.data.entityType).toBe("EmploymentContract");
  });
});
