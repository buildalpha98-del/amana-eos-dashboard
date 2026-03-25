import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";

export const POST = withApiHandler(async () => {
  const response = NextResponse.json({ success: true });
  response.cookies.set("parent-session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // Expire immediately
  });
  return response;
});
