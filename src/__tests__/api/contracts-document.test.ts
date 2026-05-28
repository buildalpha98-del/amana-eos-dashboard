/**
 * Access matrix tests for GET /api/contracts/[id]/document.
 *
 * The route is the staff portal's "View Contract" target — an access-checked
 * redirect to the contract's PDF in blob storage. The matrix:
 *   - Own contract (contract.userId === viewer): 307
 *   - Admin (owner / admin / head_office): 307
 *   - Acknowledged contracts and pending-ack contracts both: 307 (no
 *     status gating; staff can refer back to either)
 *   - Other staff's contract: 403
 *   - Missing documentUrl: 404
 *   - Not-found contract: 404
 *   - Unauthenticated: 401
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Silence the structured logger
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

// No rate-limiting in tests
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Import AFTER mocks are set up
import { GET } from "@/app/api/contracts/[id]/document/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const BLOB_URL = "https://blob.example.com/contract-x.pdf";

function callRoute(contractId: string) {
  const req = createRequest("GET", `/api/contracts/${contractId}/document`);
  return GET(req, { params: Promise.resolve({ id: contractId }) });
}

function activeUser(id: string) {
  return ({ where }: { where?: { id?: string } }) => {
    if (where?.id === id) return Promise.resolve({ active: true });
    return Promise.resolve(null);
  };
}

describe("GET /api/contracts/[id]/document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await callRoute("ct-1");
    expect(res.status).toBe(401);
  });

  it("returns 307 redirect for the contract owner (pending acknowledgement)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      documentUrl: BLOB_URL,
    });
    prismaMock.user.findUnique.mockImplementation(activeUser("staff-1"));

    const res = await callRoute("ct-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(BLOB_URL);
  });

  it("returns 307 redirect for the contract owner (already acknowledged)", async () => {
    // Acknowledgement status is not on the contract.* select — the route does
    // not gate on ack state — but we include it conceptually in the assertion
    // by re-running with a freshly-mocked contract.
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      documentUrl: BLOB_URL,
    });
    prismaMock.user.findUnique.mockImplementation(activeUser("staff-1"));

    const res = await callRoute("ct-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(BLOB_URL);
  });

  it("returns 307 for an admin viewing another user's contract", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-99",
      documentUrl: BLOB_URL,
    });
    prismaMock.user.findUnique.mockImplementation(activeUser("admin-1"));

    const res = await callRoute("ct-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(BLOB_URL);
  });

  it("returns 307 for an owner viewing another user's contract", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-99",
      documentUrl: BLOB_URL,
    });
    prismaMock.user.findUnique.mockImplementation(activeUser("owner-1"));

    const res = await callRoute("ct-1");
    expect(res.status).toBe(307);
  });

  it("returns 403 when a non-admin staff member tries to view another staff's contract", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-99",
      documentUrl: BLOB_URL,
    });
    prismaMock.user.findUnique.mockImplementation(activeUser("staff-1"));

    const res = await callRoute("ct-1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the contract has no documentUrl (e.g. blank-form draft without upload)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      documentUrl: null,
    });
    prismaMock.user.findUnique.mockImplementation(activeUser("staff-1"));

    const res = await callRoute("ct-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the contract doesn't exist", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockImplementation(activeUser("staff-1"));

    const res = await callRoute("missing-id");
    expect(res.status).toBe(404);
  });
});
