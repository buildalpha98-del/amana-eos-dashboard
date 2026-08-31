import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: vi.fn(async () => ({
    email: { senderEmail: "hello@amanaoshc.company", senderName: "Amana OSHC" },
  })),
}));

import {
  sendCampaignEmail,
  listBrevoLists,
  deleteBrevoList,
  cancelScheduledCampaign,
  cancelScheduledMessage,
} from "@/lib/brevo";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Route Brevo API calls by path suffix (input-based mock routing). */
function routeBrevo(
  overrides: Partial<Record<string, { body: unknown; status?: number }>> = {},
) {
  fetchMock.mockImplementation(async (url: string) => {
    for (const [suffix, res] of Object.entries(overrides)) {
      if (res && url.includes(suffix)) return jsonResponse(res.body, res.status);
    }
    if (url.endsWith("/contacts/lists")) return jsonResponse({ id: 789 });
    if (url.endsWith("/contacts/import")) return jsonResponse({});
    if (url.endsWith("/emailCampaigns")) return jsonResponse({ id: 456 });
    if (url.includes("/sendNow")) return jsonResponse({});
    if (url.includes("/status")) return jsonResponse({});
    return jsonResponse({});
  });
}

function callFor(suffix: string): [string, RequestInit] | undefined {
  return fetchMock.mock.calls.find(([url]) =>
    (url as string).includes(suffix),
  ) as [string, RequestInit] | undefined;
}

beforeEach(() => {
  fetchMock.mockReset();
  routeBrevo();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("sendCampaignEmail", () => {
  it("returns both campaignId and the temporary listId", async () => {
    const result = await sendCampaignEmail({
      recipients: [{ email: "a@example.com", name: "A Person" }],
      subject: "Hello",
      htmlContent: "<p>hi</p>",
    });
    expect(result).toEqual({ campaignId: 456, listId: 789 });
  });

  it("sends immediately via POST /sendNow when no scheduledAt", async () => {
    await sendCampaignEmail({
      recipients: [{ email: "a@example.com" }],
      subject: "Hello",
      htmlContent: "<p>hi</p>",
    });
    const call = callFor("/emailCampaigns/456/sendNow");
    expect(call).toBeDefined();
    expect(call![1].method).toBe("POST");
  });

  it("schedules via PUT /status when scheduledAt is set", async () => {
    await sendCampaignEmail({
      recipients: [{ email: "a@example.com" }],
      subject: "Hello",
      htmlContent: "<p>hi</p>",
      scheduledAt: "2026-08-10T09:00:00.000Z",
    });
    const call = callFor("/emailCampaigns/456/status");
    expect(call).toBeDefined();
    expect(call![1].method).toBe("PUT");
    expect(JSON.parse(call![1].body as string)).toEqual({
      scheduledAt: "2026-08-10T09:00:00.000Z",
    });
    expect(callFor("/sendNow")).toBeUndefined();
  });
});

describe("listBrevoLists", () => {
  it("issues a GET with limit/offset query params and no body", async () => {
    routeBrevo({
      "/contacts/lists?": {
        body: { lists: [{ id: 1, name: "delivery-123" }], count: 1 },
      },
    });
    const result = await listBrevoLists(50, 25);
    const call = callFor("/contacts/lists?");
    expect(call).toBeDefined();
    expect(call![0]).toContain("limit=25");
    expect(call![0]).toContain("offset=50");
    expect(call![1].method).toBe("GET");
    expect(call![1].body).toBeUndefined();
    expect(result).toEqual({
      lists: [{ id: 1, name: "delivery-123" }],
      count: 1,
    });
  });

  it("throws on a non-OK response", async () => {
    routeBrevo({ "/contacts/lists?": { body: { message: "nope" }, status: 500 } });
    await expect(listBrevoLists(0, 25)).rejects.toThrow(/Brevo list lists failed/);
  });
});

describe("deleteBrevoList", () => {
  it("issues a DELETE to /contacts/lists/:id", async () => {
    routeBrevo({ "/contacts/lists/789": { body: {}, status: 204 } });
    await deleteBrevoList(789);
    const call = callFor("/contacts/lists/789");
    expect(call).toBeDefined();
    expect(call![1].method).toBe("DELETE");
  });

  it("treats 404 as already-deleted (no throw)", async () => {
    routeBrevo({ "/contacts/lists/789": { body: {}, status: 404 } });
    await expect(deleteBrevoList(789)).resolves.toBeUndefined();
  });

  it("throws on other error statuses", async () => {
    routeBrevo({ "/contacts/lists/789": { body: {}, status: 500 } });
    await expect(deleteBrevoList(789)).rejects.toThrow(/Brevo delete list failed/);
  });
});

describe("cancelScheduledCampaign", () => {
  it("issues PUT /emailCampaigns/:id/status with body {status: 'suspended'}", async () => {
    await cancelScheduledCampaign("456");
    const call = callFor("/emailCampaigns/456/status");
    expect(call).toBeDefined();
    expect(call![1].method).toBe("PUT");
    expect(JSON.parse(call![1].body as string)).toEqual({
      status: "suspended",
    });
  });

  it("accepts a numeric campaign id", async () => {
    await cancelScheduledCampaign(456);
    expect(callFor("/emailCampaigns/456/status")).toBeDefined();
  });

  it("treats 404 as already-gone (no throw — precedent: deleteBrevoList) and reports alreadyGone: true", async () => {
    routeBrevo({ "/emailCampaigns/456/status": { body: {}, status: 404 } });
    await expect(cancelScheduledCampaign("456")).resolves.toEqual({
      alreadyGone: true,
    });
  });

  it("resolves alreadyGone: false on a normal 2xx cancel", async () => {
    await expect(cancelScheduledCampaign("456")).resolves.toEqual({
      alreadyGone: false,
    });
  });

  it("throws on other error statuses", async () => {
    routeBrevo({ "/emailCampaigns/456/status": { body: {}, status: 500 } });
    await expect(cancelScheduledCampaign("456")).rejects.toThrow(
      /Brevo cancel campaign failed/,
    );
  });
});

describe("cancelScheduledMessage", () => {
  it("issues DELETE /smtp/email/:messageId with the id URL-encoded and no body", async () => {
    await cancelScheduledMessage("<msg-1@smtp.brevo.com>");
    const call = callFor("/smtp/email/");
    expect(call).toBeDefined();
    expect(call![0]).toContain(
      `/smtp/email/${encodeURIComponent("<msg-1@smtp.brevo.com>")}`,
    );
    expect(call![1].method).toBe("DELETE");
    expect(call![1].body).toBeUndefined();
  });

  it("treats 404 as already-sent/gone (no throw — precedent: deleteBrevoList) and reports alreadyGone: true", async () => {
    routeBrevo({ "/smtp/email/": { body: {}, status: 404 } });
    await expect(cancelScheduledMessage("msg-1")).resolves.toEqual({
      alreadyGone: true,
    });
  });

  it("resolves alreadyGone: false on a normal 2xx cancel", async () => {
    await expect(cancelScheduledMessage("msg-1")).resolves.toEqual({
      alreadyGone: false,
    });
  });

  it("throws on other error statuses", async () => {
    routeBrevo({ "/smtp/email/": { body: {}, status: 500 } });
    await expect(cancelScheduledMessage("msg-1")).rejects.toThrow(
      /Brevo cancel message failed/,
    );
  });
});
