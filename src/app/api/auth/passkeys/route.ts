import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { beginPasskey, finishPasskey, listPasskeys } from "@/lib/passkeys";
import { removePasskey } from "@/lib/passkey-management";
import { BANK_DETAILS_ROLES } from "@/lib/payment-details";
import { NO_STORE_HEADERS, RECENT_AUTH_COOKIE, RECENT_AUTH_TTL_MS } from "@/lib/recent-auth";

export const GET = withApiAuth(async (req, session) => NextResponse.json(await listPasskeys(req, session), { headers: NO_STORE_HEADERS }), { roles: [...BANK_DETAILS_ROLES] });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin"), operation: z.enum(["register", "authenticate"]), purpose: z.enum(["payment_reveal", "payment_change", "passkey_setup"]), label: z.string().trim().min(1).max(60).optional() }),
  z.object({ action: z.literal("finish"), challengeId: z.string().max(100), response: z.object({ id: z.string().max(2048), rawId: z.string(), type: z.literal("public-key"), response: z.record(z.string(), z.unknown()), clientExtensionResults: z.record(z.string(), z.unknown()) }).passthrough() }),
]);
export const POST = withApiAuth(async (req, session) => {
  const input = schema.safeParse(await parseJsonBody(req));
  if (!input.success) throw ApiError.badRequest("Invalid passkey request.");
  if (input.data.action === "begin") {
    return NextResponse.json(await beginPasskey(req, session, input.data.operation, input.data.purpose, input.data.label), { headers: NO_STORE_HEADERS });
  }
  let proof: string;
  try {
    proof = await finishPasskey(req, session, input.data.challengeId, input.data.response as unknown as AuthenticationResponseJSON | RegistrationResponseJSON);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Authenticator/parser errors must not expose assertion data in logs.
    throw ApiError.unauthorized("We couldn't confirm that passkey. Please try again.");
  }
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  res.cookies.set(RECENT_AUTH_COOKIE, proof, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api", maxAge: RECENT_AUTH_TTL_MS / 1000 });
  return res;
}, { roles: [...BANK_DETAILS_ROLES], rateLimit: { max: 10, windowMs: 60_000 } });

export const DELETE = withApiAuth(async (req, session) => {
  const input = z.object({ id: z.string().min(1).max(2048) }).strict().safeParse(await parseJsonBody(req));
  if (!input.success) throw ApiError.badRequest("Choose a passkey to remove.");
  await removePasskey(req, session, input.data.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}, { roles: [...BANK_DETAILS_ROLES], rateLimit: { max: 5, windowMs: 60_000 } });
