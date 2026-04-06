import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { NextResponse } from "next/server";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Mock storage
vi.mock("@/lib/storage/uploadFile", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://blob.example.com/test-doc.pdf"),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock jose (used by parent-auth for JWT)
vi.mock("jose", () => ({
  SignJWT: vi.fn(),
  jwtVerify: vi.fn(),
}));

// Mock parent-auth with a controllable session
const _parentSession = { current: null as any };

vi.mock("@/lib/parent-auth", () => ({
  getParentSession: vi.fn(() => Promise.resolve(_parentSession.current)),
  signParentJwt: vi.fn(),
  verifyParentJwt: vi.fn(),
  withParentAuth: (handler: Function) => {
    return async (req: any, routeCtx?: any) => {
      const parent = _parentSession.current;
      if (!parent) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const ctx = {
        ...routeCtx,
        parent,
      };
      try {
        return await handler(req, ctx);
      } catch (err: any) {
        if (err?.name === "ApiError") {
          return NextResponse.json(
            { error: err.message, details: err.details },
            { status: err.status },
          );
        }
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
    };
  },
}));

import { GET as getDocuments } from "@/app/api/parent/children/[id]/documents/route";
import { GET as getPickups, POST as postPickup } from "@/app/api/parent/children/[id]/pickups/route";
import { PATCH as patchPickup } from "@/app/api/parent/children/[id]/pickups/[pickupId]/route";

const routeCtx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

const parentPayload = {
  email: "parent@test.com",
  name: "Test Parent",
  enrolmentIds: ["enrol-1"],
};

/* ------------------------------------------------------------------ */
/*  GET /api/parent/children/[id]/documents                            */
/* ------------------------------------------------------------------ */

describe("GET /api/parent/children/[id]/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no parent session", async () => {
    _parentSession.current = null;
    const req = new Request("http://localhost:3000/api/parent/children/child-1/documents");
    const res = await getDocuments(req as any, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when child does not belong to parent", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-other" });

    const req = new Request("http://localhost:3000/api/parent/children/child-1/documents");
    const res = await getDocuments(req as any, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 200 with documents for authorised child", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-1" });
    prismaMock.childDocument.findMany.mockResolvedValue([
      {
        id: "doc-1",
        documentType: "IMMUNISATION_RECORD",
        fileName: "vacc.pdf",
        fileUrl: "https://blob.example.com/vacc.pdf",
        uploaderType: "staff",
        expiresAt: null,
        isVerified: true,
        verifiedAt: new Date(),
        notes: null,
        createdAt: new Date(),
      },
    ]);
    prismaMock.parentDocument.findMany.mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/parent/children/child-1/documents");
    const res = await getDocuments(req as any, routeCtx({ id: "child-1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documents).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/parent/children/[id]/pickups                              */
/* ------------------------------------------------------------------ */

describe("GET /api/parent/children/[id]/pickups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no parent session", async () => {
    _parentSession.current = null;
    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups");
    const res = await getPickups(req as any, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with pickups for authorised child", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-1" });
    prismaMock.authorisedPickup.findMany.mockResolvedValue([
      { id: "p-1", name: "Grandma", relationship: "Grandmother", phone: "0400000000", active: true },
    ]);

    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups");
    const res = await getPickups(req as any, routeCtx({ id: "child-1" }));

    expect(res.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/parent/children/[id]/pickups                             */
/* ------------------------------------------------------------------ */

describe("POST /api/parent/children/[id]/pickups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no parent session", async () => {
    _parentSession.current = null;
    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", relationship: "Friend", phone: "0400000000" }),
    });
    const res = await postPickup(req as any, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid data", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-1" });

    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationship: "Friend" }), // Missing name and phone
    });
    const res = await postPickup(req as any, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful creation", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-1" });
    prismaMock.authorisedPickup.create.mockResolvedValue({
      id: "p-new",
      childId: "child-1",
      name: "Uncle Bob",
      relationship: "Uncle",
      phone: "0400111222",
      active: true,
    });

    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Uncle Bob", relationship: "Uncle", phone: "0400111222" }),
    });
    const res = await postPickup(req as any, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/parent/children/[id]/pickups/[pickupId]                 */
/* ------------------------------------------------------------------ */

describe("PATCH /api/parent/children/[id]/pickups/[pickupId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no parent session", async () => {
    _parentSession.current = null;
    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups/p-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await patchPickup(req as any, routeCtx({ id: "child-1", pickupId: "p-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when pickup not found", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-1" });
    prismaMock.authorisedPickup.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups/p-999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await patchPickup(req as any, routeCtx({ id: "child-1", pickupId: "p-999" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful update", async () => {
    _parentSession.current = parentPayload;
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", enrolmentId: "enrol-1" });
    prismaMock.authorisedPickup.findFirst.mockResolvedValue({
      id: "p-1",
      childId: "child-1",
      name: "Grandma",
    });
    prismaMock.authorisedPickup.update.mockResolvedValue({
      id: "p-1",
      childId: "child-1",
      name: "Updated Name",
      phone: "0400999888",
    });

    const req = new Request("http://localhost:3000/api/parent/children/child-1/pickups/p-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name", phone: "0400999888" }),
    });
    const res = await patchPickup(req as any, routeCtx({ id: "child-1", pickupId: "p-1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated Name");
  });
});
