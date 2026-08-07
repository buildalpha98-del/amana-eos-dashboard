import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import {
  GET as CATEGORIES_GET,
  POST as CATEGORIES_POST,
} from "@/app/api/help-centre/categories/route";
import {
  PATCH as CATEGORY_PATCH,
  DELETE as CATEGORY_DELETE,
} from "@/app/api/help-centre/categories/[id]/route";
import { POST as ARTICLES_POST } from "@/app/api/help-centre/articles/route";
import {
  PATCH as ARTICLE_PATCH,
  DELETE as ARTICLE_DELETE,
} from "@/app/api/help-centre/articles/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

function asAdmin() {
  mockSession({ id: "u-admin", name: "Daniel", role: "admin" });
}

describe("GET /api/help-centre/categories", () => {
  it("401 without a session", async () => {
    mockNoSession();
    const res = await CATEGORIES_GET(createRequest("GET", "/api/help-centre/categories"));
    expect(res.status).toBe(401);
  });

  it("403 for staff", async () => {
    mockSession({ id: "u-staff", name: "Edu", role: "staff" });
    const res = await CATEGORIES_GET(createRequest("GET", "/api/help-centre/categories"));
    expect(res.status).toBe(403);
  });

  it("returns categories with articleCount for admin", async () => {
    asAdmin();
    prismaMock.helpCategory.findMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Payments & CCS",
        slug: "payments-and-ccs",
        description: "",
        icon: "credit-card",
        sortOrder: 1,
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { articles: 4 },
      },
    ]);
    const res = await CATEGORIES_GET(createRequest("GET", "/api/help-centre/categories"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories[0].articleCount).toBe(4);
    expect(data.categories[0]._count).toBeUndefined();
  });
});

describe("POST /api/help-centre/categories", () => {
  it("400 when name missing", async () => {
    asAdmin();
    const res = await CATEGORIES_POST(
      createRequest("POST", "/api/help-centre/categories", { body: { description: "x" } }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a category with a slugified name", async () => {
    asAdmin();
    prismaMock.helpCategory.findUnique.mockResolvedValue(null); // slug free
    prismaMock.helpCategory.create.mockResolvedValue({ id: "cat-1" });
    const res = await CATEGORIES_POST(
      createRequest("POST", "/api/help-centre/categories", {
        body: { name: "Enrolments & Bookings", published: true },
      }),
    );
    expect(res.status).toBe(201);
    const arg = prismaMock.helpCategory.create.mock.calls[0][0];
    expect(arg.data.slug).toBe("enrolments-bookings");
    expect(arg.data.published).toBe(true);
  });
});

describe("PATCH/DELETE /api/help-centre/categories/[id]", () => {
  it("404 when category unknown", async () => {
    asAdmin();
    prismaMock.helpCategory.findUnique.mockResolvedValue(null);
    const res = await CATEGORY_PATCH(
      createRequest("PATCH", "/api/help-centre/categories/missing", { body: { published: true } }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("updates the published flag", async () => {
    asAdmin();
    prismaMock.helpCategory.findUnique.mockResolvedValue({ id: "cat-1" });
    prismaMock.helpCategory.update.mockResolvedValue({ id: "cat-1", published: false });
    const res = await CATEGORY_PATCH(
      createRequest("PATCH", "/api/help-centre/categories/cat-1", { body: { published: false } }),
      { params: Promise.resolve({ id: "cat-1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.helpCategory.update.mock.calls[0][0].data).toEqual({ published: false });
  });

  it("deletes a category", async () => {
    asAdmin();
    prismaMock.helpCategory.findUnique.mockResolvedValue({ id: "cat-1" });
    prismaMock.helpCategory.delete.mockResolvedValue({ id: "cat-1" });
    const res = await CATEGORY_DELETE(
      createRequest("DELETE", "/api/help-centre/categories/cat-1"),
      { params: Promise.resolve({ id: "cat-1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.helpCategory.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
  });
});

describe("POST /api/help-centre/articles", () => {
  it("403 for member", async () => {
    mockSession({ id: "u-coord", name: "Coord", role: "member" });
    const res = await ARTICLES_POST(
      createRequest("POST", "/api/help-centre/articles", {
        body: { categoryId: "cat-1", title: "T", body: "B" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 when category unknown", async () => {
    asAdmin();
    prismaMock.helpCategory.findUnique.mockResolvedValue(null);
    const res = await ARTICLES_POST(
      createRequest("POST", "/api/help-centre/articles", {
        body: { categoryId: "missing", title: "How do I enrol?", body: "Steps…" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates an article as a draft by default", async () => {
    asAdmin();
    prismaMock.helpCategory.findUnique.mockResolvedValue({ id: "cat-1" });
    prismaMock.helpArticle.findUnique.mockResolvedValue(null); // slug free
    prismaMock.helpArticle.create.mockResolvedValue({ id: "a-1" });
    const res = await ARTICLES_POST(
      createRequest("POST", "/api/help-centre/articles", {
        body: { categoryId: "cat-1", title: "How do I enrol?", body: "Steps…" },
      }),
    );
    expect(res.status).toBe(201);
    const arg = prismaMock.helpArticle.create.mock.calls[0][0];
    expect(arg.data.slug).toBe("how-do-i-enrol");
    expect(arg.data.published).toBe(false);
  });
});

describe("PATCH/DELETE /api/help-centre/articles/[id]", () => {
  it("404 when article unknown", async () => {
    asAdmin();
    prismaMock.helpArticle.findUnique.mockResolvedValue(null);
    const res = await ARTICLE_PATCH(
      createRequest("PATCH", "/api/help-centre/articles/missing", { body: { published: true } }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("400 when moving to an unknown category", async () => {
    asAdmin();
    prismaMock.helpArticle.findUnique.mockResolvedValue({ id: "a-1" });
    prismaMock.helpCategory.findUnique.mockResolvedValue(null);
    const res = await ARTICLE_PATCH(
      createRequest("PATCH", "/api/help-centre/articles/a-1", { body: { categoryId: "missing" } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("publishes an article", async () => {
    asAdmin();
    prismaMock.helpArticle.findUnique.mockResolvedValue({ id: "a-1" });
    prismaMock.helpArticle.update.mockResolvedValue({ id: "a-1", published: true });
    const res = await ARTICLE_PATCH(
      createRequest("PATCH", "/api/help-centre/articles/a-1", { body: { published: true } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.helpArticle.update.mock.calls[0][0].data).toEqual({ published: true });
  });

  it("deletes an article", async () => {
    asAdmin();
    prismaMock.helpArticle.findUnique.mockResolvedValue({ id: "a-1" });
    prismaMock.helpArticle.delete.mockResolvedValue({ id: "a-1" });
    const res = await ARTICLE_DELETE(
      createRequest("DELETE", "/api/help-centre/articles/a-1"),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
  });
});
