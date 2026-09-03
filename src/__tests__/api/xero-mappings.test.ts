import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET, POST } from "@/app/api/xero/mappings/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ACCOUNT_ROW = {
  id: "am-1",
  xeroConnectionId: "singleton",
  xeroAccountCode: "200",
  xeroAccountName: "OSHC Fees",
  xeroAccountType: "REVENUE",
  localCategory: "bscRevenue",
};

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/xero/mappings", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/xero/mappings"));
    expect(res.status).toBe(401);
  });

  it("403 marketing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await GET(createRequest("GET", "/api/xero/mappings"));
    expect(res.status).toBe(403);
  });

  it("returns centreMappings mirroring the POST contract, plus services and account rows", async () => {
    mockSession({ id: "jayden", name: "Jayden", role: "owner" });
    prismaMock.xeroConnection.findUnique.mockResolvedValue({
      trackingCategoryId: "tc-1",
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "s-1", name: "Centre A", code: "AAA", xeroTrackingOptionId: "opt-1" },
      { id: "s-2", name: "Centre B", code: "BBB", xeroTrackingOptionId: null },
    ]);
    prismaMock.xeroAccountMapping.findMany.mockResolvedValue([ACCOUNT_ROW]);

    const res = await GET(createRequest("GET", "/api/xero/mappings"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.trackingCategoryId).toBe("tc-1");
    expect(data.services).toHaveLength(2);
    // Only mapped services appear, in the same shape POST accepts
    expect(data.centreMappings).toEqual([
      { serviceId: "s-1", xeroTrackingOptionId: "opt-1" },
    ]);
    // Account rows keep the domain field names the settings modal transforms from
    expect(data.accountMappings).toHaveLength(1);
    expect(data.accountMappings[0]).toMatchObject({
      xeroAccountCode: "200",
      localCategory: "bscRevenue",
    });
  });

  it("returns null trackingCategoryId when no connection exists", async () => {
    mockSession({ id: "jayden", name: "Jayden", role: "owner" });
    prismaMock.xeroConnection.findUnique.mockResolvedValue(null);
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.xeroAccountMapping.findMany.mockResolvedValue([]);

    const res = await GET(createRequest("GET", "/api/xero/mappings"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.trackingCategoryId).toBeNull();
    expect(data.centreMappings).toEqual([]);
  });
});

describe("POST /api/xero/mappings", () => {
  const VALID_BODY = {
    trackingCategoryId: "tc-1",
    centreMappings: [{ serviceId: "s-1", xeroTrackingOptionId: "opt-1" }],
    accountMappings: [
      {
        xeroAccountCode: "200",
        xeroAccountName: "OSHC Fees",
        xeroAccountType: "REVENUE",
        localCategory: "bscRevenue",
      },
    ],
  };

  it("401 unauth", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/xero/mappings", { body: VALID_BODY }),
    );
    expect(res.status).toBe(401);
  });

  it("403 non-owner", async () => {
    mockSession({ id: "u", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/xero/mappings", { body: VALID_BODY }),
    );
    expect(res.status).toBe(403);
  });

  it("400 on invalid localCategory", async () => {
    mockSession({ id: "jayden", name: "Jayden", role: "owner" });
    const res = await POST(
      createRequest("POST", "/api/xero/mappings", {
        body: {
          ...VALID_BODY,
          accountMappings: [
            { ...VALID_BODY.accountMappings[0], localCategory: "notARealCategory" },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on missing trackingCategoryId", async () => {
    mockSession({ id: "jayden", name: "Jayden", role: "owner" });
    const res = await POST(
      createRequest("POST", "/api/xero/mappings", {
        body: { centreMappings: [], accountMappings: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("saves mappings and logs activity", async () => {
    mockSession({ id: "jayden", name: "Jayden", role: "owner" });
    prismaMock.xeroConnection.update.mockResolvedValue({});
    prismaMock.service.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.service.update.mockResolvedValue({});
    prismaMock.xeroAccountMapping.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.xeroAccountMapping.createMany.mockResolvedValue({ count: 1 });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/xero/mappings", { body: VALID_BODY }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    // Centre mapping written to the service
    expect(prismaMock.service.update).toHaveBeenCalledWith({
      where: { id: "s-1" },
      data: { xeroTrackingOptionId: "opt-1" },
    });
    // Account mappings recreated against the singleton connection
    const createArgs = prismaMock.xeroAccountMapping.createMany.mock.calls[0][0];
    expect(createArgs.data[0]).toMatchObject({
      xeroConnectionId: "singleton",
      xeroAccountCode: "200",
      localCategory: "bscRevenue",
    });
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });
});
