import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";

let authEnabled = true;
let parentEnrolmentIds: string[] = ["enr1"];

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
            parent: { email: string; enrolmentIds: string[] };
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
            parent: {
              email: "p1@x.test",
              enrolmentIds: parentEnrolmentIds,
            },
          });
        } catch (err) {
          if (err instanceof ApiError) {
            return new Response(
              JSON.stringify({
                error: err.message,
                ...(err.details != null ? { details: err.details } : {}),
              }),
              {
                status: err.status,
                headers: { "content-type": "application/json" },
              },
            );
          }
          throw err;
        }
      },
  };
});

import { GET } from "@/app/api/parent/children/[id]/observations/route";

beforeEach(() => {
  vi.clearAllMocks();
  authEnabled = true;
  parentEnrolmentIds = ["enr1"];
});

describe("GET /api/parent/children/[id]/observations", () => {
  it("401 when parent is not authed", async () => {
    authEnabled = false;
    const res = await GET(
      createRequest("GET", "/api/parent/children/c1/observations"),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 when child does not exist", async () => {
    prismaMock.child.findUnique.mockResolvedValue(null);
    const res = await GET(
      createRequest("GET", "/api/parent/children/c1/observations"),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("403 when parent is not on child's enrolment", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "c1",
      enrolmentId: "otherEnrolment",
      serviceId: "s1",
    });
    const res = await GET(
      createRequest("GET", "/api/parent/children/c1/observations"),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("only returns observations with visibleToParent=true", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "c1",
      enrolmentId: "enr1",
      serviceId: "s1",
    });
    prismaMock.learningObservation.findMany.mockResolvedValue([
      {
        id: "o1",
        title: "Visible",
        narrative: "n",
        mtopOutcomes: ["Learners"],
        interests: [],
        mediaUrls: [],
        createdAt: new Date(),
        author: { name: "Educator" },
      },
    ]);

    const res = await GET(
      createRequest("GET", "/api/parent/children/c1/observations"),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.learningObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { childId: "c1", visibleToParent: true },
      }),
    );
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});
