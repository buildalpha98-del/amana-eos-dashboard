import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
const auth = vi.hoisted(() => ({ loginAt: 100, tokenVersion: 3 }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => auth) }));
vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "nonce" })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "nonce" })),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 2 } })),
  verifyRegistrationResponse: vi.fn(),
}));
import { verifyAuthenticationResponse, generateAuthenticationOptions } from "@simplewebauthn/server";
import { beginPasskey, finishPasskey, passkeyOrigin } from "@/lib/passkeys";
import { decodeProof } from "@/lib/recent-auth";
const session = { user: { id: "owner", role: "owner" }, expires: "2099" } as never;
const req = (origin = "https://dashboard.example.test") => createRequest("POST", "/api/auth/passkeys", { headers: { origin } });
const response = { id: "key-1" } as never;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("PASSKEY_ORIGIN", "https://dashboard.example.test"); vi.stubEnv("NEXTAUTH_SECRET", "synthetic-passkey-secret");
  prismaMock.user.findUnique.mockResolvedValue({ id: "owner", email: "synthetic@example.test", role: "owner", active: true, isCentreAccount: false, tokenVersion: 3 });
  prismaMock.passkey.findMany.mockResolvedValue([{ id: "key-1", transports: ["internal"] }]);
  prismaMock.passkey.findFirst.mockResolvedValue({ id: "key-1", publicKey: Buffer.from([1]), counter: BigInt(1), transports: [] });
  prismaMock.passkeyChallenge.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "challenge", ...data }));
  prismaMock.passkeyChallenge.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.passkey.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.activityLog.create.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
async function challenge() {
  await beginPasskey(req(), session, "authenticate", "payment_change");
  const data = prismaMock.passkeyChallenge.create.mock.calls[0][0].data;
  prismaMock.passkeyChallenge.findUnique.mockResolvedValue({ id: "challenge", ...data });
}
describe("passkey confirmation", () => {
  it("uses the configured origin, never a caller's Host header", () => expect(passkeyOrigin()).toEqual({ origin: "https://dashboard.example.test", rpID: "dashboard.example.test" }));
  it("uses NEXTAUTH_URL when the optional override is blank", () => {
    vi.stubEnv("PASSKEY_ORIGIN", ""); vi.stubEnv("NEXTAUTH_URL", "https://dashboard.example.test");
    expect(passkeyOrigin()).toEqual({ origin: "https://dashboard.example.test", rpID: "dashboard.example.test" });
  });
  it("rejects cross-origin challenges", async () => {
    await expect(beginPasskey(req("https://attacker.test"), session, "authenticate", "payment_reveal")).rejects.toMatchObject({ status: 403 });
    expect(generateAuthenticationOptions).not.toHaveBeenCalled();
  });
  it("requires device verification and issues a purpose-bound proof after an audit", async () => {
    await challenge();
    const proof = decodeProof(await finishPasskey(req(), session, "challenge", response));
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true, expectedChallenge: "nonce", expectedOrigin: "https://dashboard.example.test", expectedRPID: "dashboard.example.test" }));
    expect(proof).toMatchObject({ uid: "owner", lat: 100, tv: 3, pur: "payment_change", method: "passkey", credentialId: "key-1" });
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });
  it("rejects a replay even with a valid cryptographic response", async () => {
    await challenge(); prismaMock.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 });
    await expect(finishPasskey(req(), session, "challenge", response)).rejects.toMatchObject({ status: 401 });
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });
  it("rejects a challenge from another login", async () => {
    await challenge(); prismaMock.passkeyChallenge.findUnique.mockResolvedValue({ id: "challenge", userId: "owner", binding: "different", expiresAt: new Date(Date.now() + 1000) });
    await expect(finishPasskey(req(), session, "challenge", response)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects another account's credential", async () => {
    await challenge(); prismaMock.passkey.findFirst.mockResolvedValue(null);
    await expect(finishPasskey(req(), session, "challenge", response)).rejects.toMatchObject({ status: 401 });
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });
  it("never issues a proof if audit storage fails", async () => {
    await challenge(); prismaMock.activityLog.create.mockRejectedValue(new Error("audit down"));
    await expect(finishPasskey(req(), session, "challenge", response)).rejects.toThrow("audit down");
  });
  it.each(["staff", "head_office", "member"])("blocks %s even with an owner session claim", async role => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role, tokenVersion: 3 });
    await expect(beginPasskey(req(), session, "authenticate", "payment_reveal")).rejects.toMatchObject({ status: 403 });
  });
});
