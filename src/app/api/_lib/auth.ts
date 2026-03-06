import { NextRequest, NextResponse } from "next/server";

/**
 * Validates requests from Cowork using a bearer token.
 * Returns a 401 NextResponse on failure, or null if auth passed.
 */
export function authenticateCowork(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.COWORK_API_KEY) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  return null; // Auth passed
}
