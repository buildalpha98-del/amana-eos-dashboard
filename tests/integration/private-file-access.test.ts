import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { assertPrivateFileAccess } from "@/lib/private-file-access";
import { mockSession, mockNoSession } from "../../src/__tests__/helpers/auth-mock";
import { GET } from "@/app/api/private-files/[id]/route";
import { createRequest } from "../../src/__tests__/helpers/request";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@vercel/blob", () => ({ get: vi.fn(async () => ({ statusCode: 200, stream: new Response("Synthetic private document").body })), put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/parent-auth", () => ({ getParentSession: vi.fn(async () => null) }));
const id = `file-test-${randomUUID()}`;
let guarded = false;
let fileId = "";
const session = (role: "staff" | "member", centre = "a") => ({ user: { id: `${id}-${role}`, role, serviceId: `${id}-${centre}` }, expires: "2099" }) as never;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/amana_security_test") throw new Error("Requires isolated local security database");
  guarded = true;
  process.env.NEXTAUTH_URL = "http://localhost:4199";
  process.env.PRIVATE_BLOB_READ_WRITE_TOKEN = "synthetic-test-only-token";
  await prisma.service.createMany({ data: ["a", "b"].map(s => ({ id: `${id}-${s}`, name: "Synthetic centre", code: `${id}-${s}` })) });
  await prisma.user.createMany({ data: ["staff", "member"].map(role => ({ id: `${id}-${role}`, name: "Synthetic person", email: `${id}-${role}@example.test`, passwordHash: "no-login-fixture", role: role as "staff" | "member", serviceId: `${id}-a`, isCentreAccount: role === "member" })) });
  await prisma.child.create({ data: { id, firstName: "Synthetic", surname: "Child", serviceId: `${id}-a` } });
  const file = await prisma.privateFile.create({ data: { blobUrl: `https://synthetic.private.blob.vercel-storage.com/${id}`, fileName: "synthetic.txt", contentType: "text/plain", childId: id, ownerUserId: `${id}-staff` } });
  fileId = file.id;
});
afterAll(async () => {
  if (!guarded) return;
  await prisma.privateFileAccess.deleteMany({ where: { fileId } });
  await prisma.privateFile.delete({ where: { id: fileId } });
  await prisma.child.delete({ where: { id } });
  await prisma.user.deleteMany({ where: { id: { in: [`${id}-staff`, `${id}-member`] } } });
  await prisma.service.deleteMany({ where: { id: { in: [`${id}-a`, `${id}-b`] } } });
  await prisma.$disconnect();
});
describe("private files with real access records", () => {
  it.each(["staff", "member"] as const)("streams an authorised %s download with no-store and an access record", async role => {
    mockSession({ id: `${id}-${role}`, role, name: "Synthetic person", serviceId: `${id}-a`, isCentreAccount: role === "member" });
    const response = await GET(createRequest("GET", `/api/private-files/${fileId}`), { params: Promise.resolve({ id: fileId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("Synthetic private document");
    expect(await prisma.privateFileAccess.count({ where: { fileId, userId: `${id}-${role}` } })).toBe(1);
  });
  it("denies the uploader after their centre changes", async () => {
    await prisma.user.update({ where: { id: `${id}-staff` }, data: { serviceId: `${id}-b` } });
    const file = await prisma.privateFile.findUniqueOrThrow({ where: { id: fileId } });
    await expect(assertPrivateFileAccess(file, session("staff"), null)).rejects.toMatchObject({ status: 404 });
  });
  it("denies logged-out requests before releasing bytes", async () => {
    mockNoSession();
    const response = await GET(createRequest("GET", `/api/private-files/${fileId}`), { params: Promise.resolve({ id: fileId }) });
    expect(response.status).toBe(401);
  });
});
