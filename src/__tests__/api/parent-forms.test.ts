/**
 * Forms a family signs in the portal.
 *
 * A signature row here may one day be read out in a dispute about
 * consent, so the rules under test are the evidentiary ones: who may
 * sign what, what counts as a signature, and what a second tap does.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrolmentSubmission: { findMany: vi.fn() },
    parentForm: { findMany: vi.fn(), findUnique: vi.fn() },
    parentFormSignature: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (
      handler: (
        req: Request,
        ctx: { parent: { email: string; enrolmentIds: string[] } },
      ) => Promise<Response>,
    ) =>
    async (req: Request) => {
      try {
        return await handler(req, {
          parent: { email: "Jane@Example.COM", enrolmentIds: ["enr-1"] },
        });
      } catch (err) {
        return Response.json(
          { error: (err as Error)?.message ?? "Error" },
          { status: (err as { status?: number })?.status ?? 500 },
        );
      }
    },
}));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/parent/forms/route";

const mockPrisma = prisma as unknown as {
  enrolmentSubmission: { findMany: ReturnType<typeof vi.fn> };
  parentForm: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  parentFormSignature: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const req = (body?: unknown) =>
  new Request("http://localhost/api/parent/forms", {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { "content-type": "application/json" },
  }) as unknown as import("next/server").NextRequest;

describe("/api/parent/forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([
      {
        serviceId: "svc-1",
        childRecords: [
          { id: "kid-1", firstName: "Abdul", serviceId: "svc-1" },
          { id: "kid-2", firstName: "Amira", serviceId: "svc-1" },
        ],
      },
    ]);
    mockPrisma.parentFormSignature.findFirst.mockResolvedValue(null);
    mockPrisma.parentFormSignature.create.mockResolvedValue({
      id: "sig-1",
      signedAt: new Date(),
    });
  });

  it("only ever sends THIS family's signature to the client", async () => {
    mockPrisma.parentForm.findMany.mockResolvedValue([]);
    await GET(req());
    const include =
      mockPrisma.parentForm.findMany.mock.calls[0][0].include;
    // Who else has signed is the centre's business, not the neighbours'.
    expect(include.signatures.where).toEqual({
      parentEmail: "jane@example.com",
    });
  });

  it("signs with a typed full name against the family's own centre", async () => {
    mockPrisma.parentForm.findUnique.mockResolvedValue({
      id: "form-1",
      serviceId: "svc-1",
      status: "active",
      perChild: false,
    });
    const res = await POST(req({ formId: "form-1", signedName: "Jane Doe" }));
    expect(res.status).toBe(200);
    expect(mockPrisma.parentFormSignature.create).toHaveBeenCalledWith({
      data: {
        formId: "form-1",
        parentEmail: "jane@example.com",
        signedName: "Jane Doe",
        childId: null,
      },
    });
  });

  it("signing twice keeps the FIRST signature", async () => {
    // The original timestamp is the legally interesting one; a re-tap
    // must not rewrite it or add a second row.
    mockPrisma.parentForm.findUnique.mockResolvedValue({
      id: "form-1",
      serviceId: "svc-1",
      status: "active",
      perChild: false,
    });
    mockPrisma.parentFormSignature.findFirst.mockResolvedValue({
      id: "sig-existing",
      signedAt: new Date("2026-08-01"),
    });
    const res = await POST(req({ formId: "form-1", signedName: "Jane Doe" }));
    expect(res.status).toBe(200);
    expect(mockPrisma.parentFormSignature.create).not.toHaveBeenCalled();
  });

  it("per-child form: requires a child, and one of THIS family's", async () => {
    // The CWA shape — signing for Abdul says nothing about Amira.
    mockPrisma.parentForm.findUnique.mockResolvedValue({
      id: "cwa-1",
      serviceId: "svc-1",
      status: "active",
      perChild: true,
    });

    // No child chosen → told to choose, not silently family-signed.
    let res = await POST(req({ formId: "cwa-1", signedName: "Jane Doe" }));
    expect(res.status).toBe(400);

    // Someone else's child → refused.
    res = await POST(
      req({ formId: "cwa-1", signedName: "Jane Doe", childId: "not-ours" }),
    );
    expect(res.status).toBe(400);

    // Their own child → signed FOR that child.
    res = await POST(
      req({ formId: "cwa-1", signedName: "Jane Doe", childId: "kid-1" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.parentFormSignature.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ formId: "cwa-1", childId: "kid-1" }),
    });
  });

  it("rejects a single-word signature", async () => {
    mockPrisma.parentForm.findUnique.mockResolvedValue({
      id: "form-1",
      serviceId: "svc-1",
      status: "active",
    });
    const res = await POST(req({ formId: "form-1", signedName: "Jane" }));
    expect(res.status).toBe(400);
    // A single letter is a tap, not a signature.
    expect(mockPrisma.parentFormSignature.create).not.toHaveBeenCalled();
  });

  it("refuses a form from a centre the family isn't at", async () => {
    // Otherwise a guessed id lets anyone sign anything.
    mockPrisma.parentForm.findUnique.mockResolvedValue({
      id: "form-x",
      serviceId: "svc-other",
      status: "active",
    });
    const res = await POST(req({ formId: "form-x", signedName: "Jane Doe" }));
    expect(res.status).toBe(403);
    expect(mockPrisma.parentFormSignature.create).not.toHaveBeenCalled();
  });

  it("won't sign an archived form", async () => {
    mockPrisma.parentForm.findUnique.mockResolvedValue({
      id: "form-1",
      serviceId: "svc-1",
      status: "archived",
    });
    const res = await POST(req({ formId: "form-1", signedName: "Jane Doe" }));
    expect(res.status).toBe(404);
  });
});
