import type { NextRequest, NextResponse } from "next/server";

/**
 * Wrappers support direct request-only calls as well as Next's promised params.
 * Keep the route-context signature last: Next's generated route validation
 * extracts the last overload's second argument.
 */
export interface WrappedRouteHandler {
  (request: NextRequest): Promise<NextResponse>;
  (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse>;
}
