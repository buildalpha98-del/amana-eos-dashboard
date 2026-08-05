/**
 * The staff-side signature record for a form — the data behind the
 * compliance-folder PDF. The interesting rules: centre scoping, and
 * that "who's still owing" is computed against the right population
 * (children for a per-child form, contact families otherwise).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));
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

import { GET } from "@/app/api/services/[id]/parent-forms/[formId]/signatures/route";

const ctx = (id = "svc-1", formId = "form-1") => ({
  params: Promise.resolve({ id, formId }),
});
const req = () =>
  createRequest("GET", "/api/services/svc-1/parent-forms/form-1/signatures");

const baseForm = {
  id: "form-1",
  serviceId: "svc-1",
  title: "Term 4 excursion consent",
  description: null,
  dueDate: null,
  perChild: false,
  status: "active",
  createdAt: new Date("2026-08-01"),
  service: { name: "Amana at Riverbank" },
  signatures: [
    {
      childId: null,
      parentEmail: "jane@example.com",
      signedName: "Jane Doe",
      signedAt: new Date("2026-08-02"),
      child: null,
    },
  ],
};

describe("GET /api/services/[id]/parent-forms/[formId]/signatures", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("a member from another centre is refused", async () => {
    mockSession({
      id: "u-1",
      name: "Other",
      role: "member",
      serviceId: "svc-OTHER",
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it("family form: outstanding = active contacts who haven't signed", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.parentForm.findUnique.mockResolvedValue(baseForm);
    prismaMock.centreContact.findMany.mockResolvedValue([
      { email: "JANE@example.com ", firstName: "Jane", lastName: "Doe" },
      { email: "sam@example.com", firstName: "Sam", lastName: "Nguyen" },
      { email: "noname@example.com", firstName: null, lastName: null },
    ]);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Jane signed (case/space-insensitively matched); the others owe.
    expect(body.outstanding).toEqual(["Sam Nguyen", "noname@example.com"]);
    expect(body.signatures[0].signedName).toBe("Jane Doe");
    expect(body.signatures[0].childName).toBeNull();
  });

  it("per-child form: outstanding = this centre's unsigned children", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.parentForm.findUnique.mockResolvedValue({
      ...baseForm,
      perChild: true,
      signatures: [
        {
          childId: "kid-1",
          parentEmail: "jane@example.com",
          signedName: "Jane Doe",
          signedAt: new Date("2026-08-02"),
          child: { firstName: "Abdul", surname: "Doe" },
        },
      ],
    });
    prismaMock.child.findMany.mockResolvedValue([
      { id: "kid-1", firstName: "Abdul", surname: "Doe" },
      { id: "kid-2", firstName: "Amira", surname: "Doe" },
    ]);
    const res = await GET(req(), ctx());
    const body = await res.json();
    expect(body.outstanding).toEqual(["Amira Doe"]);
    expect(body.signatures[0].childName).toBe("Abdul Doe");
    // The population queried is the centre's children, not contacts.
    expect(prismaMock.child.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serviceId: "svc-1" } }),
    );
  });

  it("a form belonging to a different service 404s, not leaks", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.parentForm.findUnique.mockResolvedValue({
      ...baseForm,
      serviceId: "svc-OTHER",
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });

  it("archived forms still return their record (evidence stays reachable)", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.parentForm.findUnique.mockResolvedValue({
      ...baseForm,
      status: "archived",
    });
    prismaMock.centreContact.findMany.mockResolvedValue([]);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.form.status).toBe("archived");
  });
});
