/**
 * Test request helpers for Next.js App Router API route testing.
 *
 * Usage:
 *   import { createRequest } from "../helpers/request";
 *
 *   const req = createRequest("GET", "/api/rocks?quarter=Q1-2025");
 *   const res = await GET(req);
 *   const data = await res.json();
 */

import { NextRequest } from "next/server";

const BASE_URL = "http://localhost:3000";

/**
 * Create a NextRequest for testing API routes.
 */
export function createRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options?: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): NextRequest {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  };

  if (options?.body && method !== "GET") {
    init.body = JSON.stringify(options.body);
  }

  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}
