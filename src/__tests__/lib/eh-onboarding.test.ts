import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

const initiateSelfSetup = vi.fn();
const findEmployeeByEmail = vi.fn();
let configured = true;
vi.mock("@/lib/eh-payroll", () => ({
  initiateSelfSetup: (...a: unknown[]) => initiateSelfSetup(...a),
  findEmployeeByEmail: (...a: unknown[]) => findEmployeeByEmail(...a),
  isConfigured: () => configured,
  isLiveEhStatus: (s: string) => s === "Active" || s === "Incomplete",
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { setUpInEmploymentHero, setUpInEmploymentHeroSafely } from "@/lib/eh-onboarding";

const user = (over: Record<string, unknown> = {}) => ({
  id: "u1", name: "Amina Yusuf", email: "amina@x.com", phone: "0400", active: true,
  isCentreAccount: false, employmentHeroEmployeeId: null, ...over,
});

describe("setUpInEmploymentHero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured = true;
    prismaMock.activityLog.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
  });

  it("links an existing live EH record by email without emailing anyone", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user() as never);
    findEmployeeByEmail.mockResolvedValue({ id: 77, status: "Active" });
    const r = await setUpInEmploymentHero("u1");
    expect(r.status).toBe("linked_existing");
    expect(initiateSelfSetup).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { employmentHeroEmployeeId: 77 } });
  });

  it("creates them in EH via Self Setup, then links the new record", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user() as never);
    findEmployeeByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 88, status: "Incomplete" });
    const r = await setUpInEmploymentHero("u1");
    expect(initiateSelfSetup).toHaveBeenCalledWith({
      firstName: "Amina", surname: "Yusuf", email: "amina@x.com", mobile: "0400",
    });
    expect(r).toMatchObject({ status: "invited", ehEmployeeId: 88 });
  });

  it("doesn't re-use a Terminated record — invites fresh", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user() as never);
    findEmployeeByEmail.mockResolvedValueOnce({ id: 5, status: "Terminated" }).mockResolvedValueOnce(null);
    const r = await setUpInEmploymentHero("u1");
    expect(initiateSelfSetup).toHaveBeenCalled();
    expect(r.status).toBe("invited");
    expect(r.ehEmployeeId).toBeNull();
  });

  it("does nothing for someone already linked, unless asked to re-send", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ employmentHeroEmployeeId: 42 }) as never);
    expect((await setUpInEmploymentHero("u1")).status).toBe("already_linked");
    expect(initiateSelfSetup).not.toHaveBeenCalled();
    const r = await setUpInEmploymentHero("u1", { resendIfLinked: true });
    expect(r.status).toBe("resent");
    expect(initiateSelfSetup).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it("skips centre mailboxes", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ isCentreAccount: true }) as never);
    expect((await setUpInEmploymentHero("u1")).status).toBe("skipped");
    expect(findEmployeeByEmail).not.toHaveBeenCalled();
  });

  it("reports not_configured without touching EH", async () => {
    configured = false;
    expect((await setUpInEmploymentHero("u1")).status).toBe("not_configured");
  });

  it("the safe wrapper never throws", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user() as never);
    findEmployeeByEmail.mockRejectedValue(new Error("EH down"));
    await expect(setUpInEmploymentHeroSafely("u1")).resolves.toBeNull();
  });
});
