import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));

// Mock logger
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

// Import after mocks
import { GET, POST } from "@/app/api/contracts/route";
import {
  GET as getContract,
  PATCH,
} from "@/app/api/contracts/[id]/route";
import { POST as terminateContract } from "@/app/api/contracts/[id]/terminate/route";

describe("GET /api/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/contracts");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns contracts list for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockContracts = [
      {
        id: "c-1",
        userId: "user-2",
        contractType: "ct_permanent",
        payRate: 35.5,
        startDate: new Date("2026-01-01"),
        status: "active",
        user: {
          id: "user-2",
          name: "Staff",
          email: "staff@test.com",
          avatar: null,
          serviceId: "svc-1",
          service: { id: "svc-1", name: "Centre A" },
        },
      },
    ];
    prismaMock.employmentContract.findMany.mockResolvedValue(mockContracts);

    const req = createRequest("GET", "/api/contracts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].contractType).toBe("ct_permanent");
  });
});

describe("POST /api/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 with missing required fields", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const req = createRequest("POST", "/api/contracts", {
      body: { userId: "user-2" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when non-admin tries to create", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });

    const req = createRequest("POST", "/api/contracts", {
      body: {
        userId: "user-2",
        contractType: "ct_permanent",
        payRate: 35.5,
        startDate: "2026-01-01",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("creates contract with valid data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    // user lookup for the contract target
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => {
        if (args.where.id === "user-2") {
          return { id: "user-2", name: "Staff", active: true };
        }
        // Active check for session user
        return { active: true };
      }
    );

    const created = {
      id: "c-new",
      userId: "user-2",
      contractType: "ct_permanent",
      payRate: 35.5,
      hoursPerWeek: 38,
      startDate: new Date("2026-01-01"),
      endDate: null,
      status: "contract_draft",
      user: { id: "user-2", name: "Staff", email: "staff@test.com", avatar: null },
    };
    prismaMock.employmentContract.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/contracts", {
      body: {
        userId: "user-2",
        contractType: "ct_permanent",
        payRate: 35.5,
        hoursPerWeek: 38,
        startDate: "2026-01-01",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("c-new");
    expect(prismaMock.employmentContract.create).toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });
});

describe("PATCH /api/contracts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 for unknown contract", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/contracts/unknown-id", {
      body: { payRate: 40 },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "unknown-id" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Contract not found");
  });

  it("updates contract successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const existing = {
      id: "c-1",
      userId: "user-2",
      contractType: "ct_permanent",
      payRate: 35.5,
      status: "active",
    };
    prismaMock.employmentContract.findUnique.mockResolvedValue(existing);

    const updated = {
      ...existing,
      payRate: 40,
      user: { id: "user-2", name: "Staff", email: "staff@test.com", avatar: null },
    };
    prismaMock.employmentContract.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/contracts/c-1", {
      body: { payRate: 40 },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "c-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payRate).toBe(40);
  });

  it("returns 403 when non-admin tries to update", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });

    const req = createRequest("PATCH", "/api/contracts/c-1", {
      body: { payRate: 40 },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "c-1" }),
    });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/contracts/[id]/terminate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("terminates an active contract", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const existing = {
      id: "c-1",
      userId: "user-2",
      contractType: "ct_permanent",
      payRate: 35.5,
      status: "active",
    };
    prismaMock.employmentContract.findUnique.mockResolvedValue(existing);

    const terminated = {
      ...existing,
      status: "terminated",
      endDate: new Date(),
      user: { id: "user-2", name: "Staff", email: "staff@test.com", avatar: null },
    };
    prismaMock.employmentContract.update.mockResolvedValue(terminated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/contracts/c-1/terminate", {
      body: { notes: "End of employment" },
    });
    const res = await terminateContract(req, {
      params: Promise.resolve({ id: "c-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("terminated");
  });
});
