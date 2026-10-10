import { describe, expect, expectTypeOf, it } from "vitest";
import { withApiHandler } from "@/lib/api-handler";
import type { WrappedRouteHandler } from "@/lib/route-handler";
import { NextRequest, NextResponse } from "next/server";

// Mirror the installed Next validator so reordering the overloads cannot
// silently restore the build failure. Both supported invocation forms matter.
type SecondArg<T> = T extends (...args: [infer _A, infer B]) => unknown ? B : never;

describe("wrapped route contract", () => {
  it("exposes promised params to Next's route validator", () => {
    expectTypeOf<SecondArg<WrappedRouteHandler>>().toEqualTypeOf<{
      params: Promise<Record<string, string>>;
    }>();
  });

  it("forwards the same promised params and supports request-only routes", async () => {
    const context = { params: Promise.resolve({ id: "child-1" }) };
    const route = withApiHandler(async (_req, received) => {
      expect(received).toBe(context);
      return NextResponse.json(await received?.params);
    });
    const req = new NextRequest("http://localhost/api/example/child-1");
    const res = await route(req, context);
    expect(await res.json()).toEqual({ id: "child-1" });
    const plain = withApiHandler(() => NextResponse.json({ ok: true }));
    expect((await plain(req)).status).toBe(200);
  });
});
