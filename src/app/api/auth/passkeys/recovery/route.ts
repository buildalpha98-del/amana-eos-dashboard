import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { BANK_DETAILS_ROLES } from "@/lib/payment-details";
import { generateRecoveryCodes, recoverPasskeys } from "@/lib/passkey-management";
import { NO_STORE_HEADERS, RECENT_AUTH_COOKIE } from "@/lib/recent-auth";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }).strict(),
  z.object({ action: z.literal("recover"), password: z.string().min(1).max(200), mfaCode: z.string().max(20).optional(), recoveryCode: z.string().trim().regex(/^(?:[a-fA-F0-9]{4}-){7}[a-fA-F0-9]{4}$|^[a-fA-F0-9]{32}$/) }).strict(),
]);
export const POST = withApiAuth(async (req, session) => {
  const input = schema.safeParse(await parseJsonBody(req));
  if (!input.success) throw ApiError.badRequest("Check the recovery details and try again.");
  if (input.data.action === "generate") return NextResponse.json({ codes: await generateRecoveryCodes(req, session) }, { headers: NO_STORE_HEADERS });
  await recoverPasskeys(req, session, input.data);
  const response = NextResponse.json({ ok: true, signInAgain: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(RECENT_AUTH_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api", maxAge: 0 });
  return response;
}, { roles: [...BANK_DETAILS_ROLES], rateLimit: { max: 5, windowMs: 15 * 60_000 } });
