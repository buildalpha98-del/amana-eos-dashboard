import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";

let authEnabled = true;

vi.mock("@/lib/parent-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parent-auth")>(
    "@/lib/parent-auth",
  );
  return {
    ...actual,
    withParentAuth:
      (
        handler: (
          req: unknown,
          ctx: {
            parent: { email: string; enrolmentIds: string[]; name: string };
            params?: Promise<Record<string, string>>;
          },
        ) => Promise<Response>,
      ) =>
      async (
        req: unknown,
        routeContext?: { params?: Promise<Record<string, string>> },
      ) => {
        if (!authEnabled) {
          return new Response(
            JSON.stringify({ error: "Invalid or expired parent session" }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
        }
        try {
          return await handler(req, {
            ...routeContext,
            parent: { email: "p@x.test", name: "Aysha", enrolmentIds: ["enr-mine"] },
          });
        } catch (err) {
          if (err instanceof ApiError) {
            return new Response(
              JSON.stringify({
                error: err.message,
                ...(err.details != null ? { details: err.details } : {}),
              }),
              { status: err.status, headers: { "content-type": "application/json" } },
            );
          }
          throw err;
        }
      },
  };
});

import { GET, PATCH } from "@/app/api/parent/children/[id]/all-about-me/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/parent/children/[id]/all-about-me", () => {
  beforeEach(() => {
    authEnabled = true;
    vi.clearAllMocks();
  });

  it("GET returns 401 when no parent session", async () => {
    authEnabled = false;
    const res = await GET(
      createRequest("GET", "/api/parent/children/child-1/all-about-me"),
      ctx("child-1"),
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 404 when child does not exist", async () => {
    prismaMock.child.findUnique.mockResolvedValue(null);
    const res = await GET(
      createRequest("GET", "/api/parent/children/missing/all-about-me"),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("GET returns 403 when child belongs to another enrolment", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: "enr-other",
    });
    const res = await GET(
      createRequest("GET", "/api/parent/children/child-1/all-about-me"),
      ctx("child-1"),
    );
    expect(res.status).toBe(403);
  });

  it("GET returns null when no AllAboutMe record yet", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: "enr-mine",
    });
    prismaMock.allAboutMe.findUnique.mockResolvedValue(null);

    const res = await GET(
      createRequest("GET", "/api/parent/children/child-1/all-about-me"),
      ctx("child-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allAboutMe).toBeNull();
  });

  it("PATCH 400 on invalid input", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: "enr-mine",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/parent/children/child-1/all-about-me", {
        body: { nickname: "x".repeat(80) },
      }),
      ctx("child-1"),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH upserts the AllAboutMe record and sets submittedAt on first save", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: "enr-mine",
    });
    prismaMock.allAboutMe.findUnique.mockResolvedValue(null);
    const now = new Date("2026-05-14T10:00:00Z");
    prismaMock.allAboutMe.upsert.mockResolvedValue({
      id: "aam-1",
      childId: "child-1",
      nickname: "Sami",
      favouriteFood: "Mango",
      submittedAt: now,
    });

    const res = await PATCH(
      createRequest("PATCH", "/api/parent/children/child-1/all-about-me", {
        body: { nickname: "Sami", favouriteFood: "Mango" },
      }),
      ctx("child-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allAboutMe.nickname).toBe("Sami");

    expect(prismaMock.allAboutMe.upsert).toHaveBeenCalledOnce();
    const args = prismaMock.allAboutMe.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ childId: "child-1" });
    expect(args.create.nickname).toBe("Sami");
    expect(args.create.submittedAt).toBeInstanceOf(Date);
  });

  it("PATCH preserves submittedAt on subsequent updates", async () => {
    const submittedAt = new Date("2026-04-01T10:00:00Z");
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      enrolmentId: "enr-mine",
    });
    prismaMock.allAboutMe.findUnique.mockResolvedValue({
      id: "aam-1",
      childId: "child-1",
      submittedAt,
    });
    prismaMock.allAboutMe.upsert.mockResolvedValue({
      id: "aam-1",
      childId: "child-1",
      nickname: "Sami",
      submittedAt,
    });

    await PATCH(
      createRequest("PATCH", "/api/parent/children/child-1/all-about-me", {
        body: { nickname: "Sami" },
      }),
      ctx("child-1"),
    );

    const args = prismaMock.allAboutMe.upsert.mock.calls[0][0];
    // Update path keeps the existing submittedAt — not a fresh `new Date()`.
    expect(args.update.submittedAt).toEqual(submittedAt);
  });
});
