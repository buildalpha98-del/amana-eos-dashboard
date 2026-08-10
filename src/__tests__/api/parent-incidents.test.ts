import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
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
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

// The parent JWT is the only auth here; stub it to a known family.
vi.mock("@/lib/parent-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parent-auth")>(
    "@/lib/parent-auth",
  );
  return {
    ...actual,
    withParentAuth:
      (handler: (req: unknown, ctx: unknown) => unknown) =>
      (req: unknown, ctx: unknown) =>
        handler(req, {
          ...(ctx as object),
          parent: {
            email: "parent@x.com",
            name: "Parent",
            enrolmentIds: ["enr-1"],
          },
        }),
  };
});

import { GET, POST } from "@/app/api/parent/children/[id]/incidents/route";

const ctx = { params: Promise.resolve({ id: "child-1" }) };

/** A child this parent is entitled to see. */
const ownChild = { id: "child-1", enrolmentId: "enr-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET — access", () => {
  it("404s for a child that doesn't exist", async () => {
    prismaMock.child.findUnique.mockResolvedValue(null as never);
    await expect(GET(createRequest("GET", "/x"), ctx as never)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("403s for another family's child", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: "enr-OTHER",
    } as never);
    await expect(GET(createRequest("GET", "/x"), ctx as never)).rejects.toMatchObject(
      { status: 403 },
    );
    expect(prismaMock.incidentRecord.findMany).not.toHaveBeenCalled();
  });

  it("403s for a child with no enrolment link at all", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: null,
    } as never);
    await expect(GET(createRequest("GET", "/x"), ctx as never)).rejects.toMatchObject(
      { status: 403 },
    );
  });
});

describe("GET — the share gate", () => {
  beforeEach(() => {
    prismaMock.child.findUnique.mockResolvedValue(ownChild as never);
    prismaMock.incidentRecord.findMany.mockResolvedValue([] as never);
  });

  it("only returns records a human has shared", async () => {
    // Nothing reaches a family until someone publishes it — a behaviour
    // incident naming another child must never auto-publish.
    await GET(createRequest("GET", "/x"), ctx as never);
    const where = prismaMock.incidentRecord.findMany.mock.calls[0][0].where;
    expect(where.sharedWithParentAt).toEqual({ not: null });
    expect(where.childId).toBe("child-1");
    expect(where.deleted).toBe(false);
  });

  it("never selects witnesses or medical personnel", async () => {
    // Those fields can name other families' children and staff.
    await GET(createRequest("GET", "/x"), ctx as never);
    const select = prismaMock.incidentRecord.findMany.mock.calls[0][0].select;
    expect(select.witnesses).toBeUndefined();
    expect(select.medicalPersonnelContacted).toBeUndefined();
    expect(select.recordedSignature).toBeUndefined();
    // …but does return what happened to their own child.
    expect(select.description).toBe(true);
    expect(select.actionTaken).toBe(true);
  });
});

describe("POST — acknowledgement", () => {
  beforeEach(() => {
    prismaMock.child.findUnique.mockResolvedValue(ownChild as never);
  });

  const body = { incidentId: "inc-1", signedName: "Sam Parent" };

  it("records the signature, time and email", async () => {
    prismaMock.incidentRecord.findUnique.mockResolvedValue({
      id: "inc-1",
      childId: "child-1",
      deleted: false,
      sharedWithParentAt: new Date("2026-08-10"),
      parentAcknowledgedAt: null,
      parentAcknowledgedName: null,
    } as never);
    prismaMock.incidentRecord.update.mockResolvedValue({
      parentAcknowledgedAt: new Date(),
      parentAcknowledgedName: "Sam Parent",
    } as never);

    const res = await POST(
      createRequest("POST", "/x", { body }),
      ctx as never,
    );
    const out = await res.json();

    expect(out.acknowledged).toBe(true);
    expect(out.alreadyAcknowledged).toBe(false);
    expect(prismaMock.incidentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentAcknowledgedName: "Sam Parent",
          parentAcknowledgedEmail: "parent@x.com",
        }),
      }),
    );
  });

  it("never overwrites an existing acknowledgement", async () => {
    // A second parent opening the report must not replace the first
    // one's signature — the record is evidence of who confirmed it.
    const first = new Date("2026-08-10T10:00:00.000Z");
    prismaMock.incidentRecord.findUnique.mockResolvedValue({
      id: "inc-1",
      childId: "child-1",
      deleted: false,
      sharedWithParentAt: new Date("2026-08-10"),
      parentAcknowledgedAt: first,
      parentAcknowledgedName: "First Parent",
    } as never);

    const res = await POST(createRequest("POST", "/x", { body }), ctx as never);
    const out = await res.json();

    expect(out.alreadyAcknowledged).toBe(true);
    expect(out.acknowledgedName).toBe("First Parent");
    expect(prismaMock.incidentRecord.update).not.toHaveBeenCalled();
  });

  it("404s for a record that hasn't been shared", async () => {
    // Same 404 as "doesn't exist" — whether an unshared report exists is
    // not the family's to infer.
    prismaMock.incidentRecord.findUnique.mockResolvedValue({
      id: "inc-1",
      childId: "child-1",
      deleted: false,
      sharedWithParentAt: null,
      parentAcknowledgedAt: null,
    } as never);

    await expect(
      POST(createRequest("POST", "/x", { body }), ctx as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("404s for another child's report", async () => {
    prismaMock.incidentRecord.findUnique.mockResolvedValue({
      id: "inc-1",
      childId: "child-OTHER",
      deleted: false,
      sharedWithParentAt: new Date(),
      parentAcknowledgedAt: null,
    } as never);

    await expect(
      POST(createRequest("POST", "/x", { body }), ctx as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("404s for a deleted report", async () => {
    prismaMock.incidentRecord.findUnique.mockResolvedValue({
      id: "inc-1",
      childId: "child-1",
      deleted: true,
      sharedWithParentAt: new Date(),
      parentAcknowledgedAt: null,
    } as never);

    await expect(
      POST(createRequest("POST", "/x", { body }), ctx as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("requires a typed name", async () => {
    await expect(
      POST(
        createRequest("POST", "/x", { body: { incidentId: "inc-1", signedName: "" } }),
        ctx as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
