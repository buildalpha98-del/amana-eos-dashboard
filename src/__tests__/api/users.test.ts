import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock service-scope
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

// Mock password-breach-check
vi.mock("@/lib/password-breach-check", () => ({
  checkPasswordBreach: vi.fn(() => 0),
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  hash: vi.fn(() => "$2a$12$hashed"),
  default: { hash: vi.fn(() => "$2a$12$hashed"), compare: vi.fn() },
}));

// Mock email
vi.mock("@/lib/email", () => ({
  getResend: vi.fn(() => null),
  FROM_EMAIL: "test@test.com",
}));

// Mock email-templates
vi.mock("@/lib/email-templates", () => ({
  welcomeEmail: vi.fn(() => ({ subject: "Welcome", html: "<p>Welcome</p>" })),
}));

// Mock audit-log
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

// Mock notification-defaults
vi.mock("@/lib/notification-defaults", () => ({
  getDefaultNotificationPrefs: vi.fn(() => ({})),
}));

// Mock onboarding-seed
vi.mock("@/lib/onboarding-seed", () => ({
  seedOnboardingPackage: vi.fn(),
}));

// Mock logger + rate limit
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { GET, POST } from "@/app/api/users/route";
import { PATCH, DELETE } from "@/app/api/users/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      // withApiAuth active check by session user id
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
      return null;
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/users");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns users list for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const mockUsers = [
      { id: "u1", name: "Alice", email: "alice@test.com", role: "admin", active: true },
      { id: "u2", name: "Bob", email: "bob@test.com", role: "member", active: true },
    ];
    prismaMock.user.findMany.mockResolvedValue(mockUsers);

    const req = createRequest("GET", "/api/users");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Alice");
  });

  it("filters by role when param provided", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.user.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/users?role=admin");
    await GET(req);

    const callArgs = prismaMock.user.findMany.mock.calls[0][0];
    expect(callArgs.where.role).toBe("admin");
  });

  it("filters by active status", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.user.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/users?active=true");
    await GET(req);

    const callArgs = prismaMock.user.findMany.mock.calls[0][0];
    expect(callArgs.where.active).toBe(true);
  });

  it("filters by serviceId", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.user.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/users?serviceId=svc-1");
    await GET(req);

    const callArgs = prismaMock.user.findMany.mock.calls[0][0];
    expect(callArgs.where.serviceId).toBe("svc-1");
  });
});

describe("POST /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockReset();
    // Default: active check passes, no email collisions
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
      if (args?.where?.id === "user-2") return { active: true, id: "user-2", role: "member" };
      return null;
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/users", {
      body: { name: "Test", email: "t@t.com", password: "StrongPass123!!", role: "member", serviceId: "svc-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "user-2", name: "Member", role: "member" });
    const req = createRequest("POST", "/api/users", {
      body: { name: "Test", email: "t@t.com", password: "StrongPass123!!", role: "member", serviceId: "svc-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when email is missing", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/users", {
      body: { name: "Test", password: "StrongPass123!!" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/users", {
      body: { email: "test@test.com", password: "StrongPass123!!" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 when email already exists", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
      if (args?.where?.email === "taken@test.com") return { id: "existing", email: "taken@test.com" };
      return null;
    });

    const req = createRequest("POST", "/api/users", {
      body: { name: "Test", email: "taken@test.com", password: "StrongPass123!!", role: "admin" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already exists");
  });

  it("returns 403 when admin tries to create owner", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    // Override: user-1 is admin in this test
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "admin" };
      return null;
    });

    const req = createRequest("POST", "/api/users", {
      body: { name: "Test", email: "new@test.com", password: "StrongPass123!!", role: "owner" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when staff/member role has no serviceId", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const req = createRequest("POST", "/api/users", {
      body: { name: "Test", email: "new@test.com", password: "StrongPass123!!", role: "staff" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("service");
  });

  it("returns 201 when creating a valid user", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const createdUser = {
      id: "new-user",
      name: "New User",
      email: "new@test.com",
      role: "admin",
      active: true,
      serviceId: null,
      state: null,
      service: null,
      createdAt: new Date(),
    };
    prismaMock.user.create.mockResolvedValue(createdUser);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/users", {
      body: { name: "New User", email: "new@test.com", password: "StrongPass123!!", role: "admin" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("New User");
    expect(body.email).toBe("new@test.com");
  });
});

describe("PATCH /api/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
      return null;
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/users/user-2", { body: { name: "Updated" } });
    const context = { params: Promise.resolve({ id: "user-2" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown user ID", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    // Default impl already returns null for unknown IDs

    const req = createRequest("PATCH", "/api/users/unknown", { body: { name: "Updated" } });
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("updates user name successfully", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
      if (args?.where?.id === "user-2") return { id: "user-2", role: "member", name: "Old Name" };
      return null;
    });

    const updatedUser = { id: "user-2", name: "Updated Name", email: "u2@test.com", role: "member", active: true };
    prismaMock.user.update.mockResolvedValue(updatedUser);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/users/user-2", { body: { name: "Updated Name" } });
    const context = { params: Promise.resolve({ id: "user-2" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");
  });

  it("returns 403 when admin tries to modify another admin", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "admin" };
      if (args?.where?.id === "user-2") return { id: "user-2", role: "admin", name: "Other Admin" };
      return null;
    });

    const req = createRequest("PATCH", "/api/users/user-2", { body: { name: "Hacked" } });
    const context = { params: Promise.resolve({ id: "user-2" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
      return null;
    });
  });

  it("returns 403 for non-owner", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    const req = createRequest("DELETE", "/api/users/user-2");
    const context = { params: Promise.resolve({ id: "user-2" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to self-delete", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("DELETE", "/api/users/user-1");
    const context = { params: Promise.resolve({ id: "user-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("cannot delete your own");
  });
});
