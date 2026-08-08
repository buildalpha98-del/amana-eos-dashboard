import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 4, resetIn: 60000 })),
}));

import { GET as ARTICLES_GET } from "@/app/api/public/help-centre/articles/route";
import { POST as TICKETS_POST } from "@/app/api/public/help-centre/tickets/route";
import { checkRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/public/help-centre/articles", () => {
  it("lists published articles in published categories only", async () => {
    prismaMock.helpArticle.findMany.mockResolvedValue([
      { id: "a-1", title: "How do I enrol?", slug: "how-do-i-enrol", updatedAt: new Date(), category: { name: "Enrolments", slug: "enrolments" } },
    ]);
    const res = await ARTICLES_GET(createRequest("GET", "/api/public/help-centre/articles"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
    const where = prismaMock.helpArticle.findMany.mock.calls[0][0].where;
    expect(where.published).toBe(true);
    expect(where.category).toEqual({ is: { published: true } });
  });

  it("scopes to a category slug", async () => {
    prismaMock.helpArticle.findMany.mockResolvedValue([]);
    const res = await ARTICLES_GET(
      createRequest("GET", "/api/public/help-centre/articles?category=payments-and-ccs"),
    );
    expect(res.status).toBe(200);
    const where = prismaMock.helpArticle.findMany.mock.calls[0][0].where;
    expect(where.category).toEqual({ is: { published: true, slug: "payments-and-ccs" } });
  });

  it("searches title and body case-insensitively", async () => {
    prismaMock.helpArticle.findMany.mockResolvedValue([]);
    const res = await ARTICLES_GET(
      createRequest("GET", "/api/public/help-centre/articles?search=CCS"),
    );
    expect(res.status).toBe(200);
    const where = prismaMock.helpArticle.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { title: { contains: "CCS", mode: "insensitive" } },
      { body: { contains: "CCS", mode: "insensitive" } },
    ]);
  });

  it("orders by viewCount when popular=1", async () => {
    prismaMock.helpArticle.findMany.mockResolvedValue([]);
    const res = await ARTICLES_GET(
      createRequest("GET", "/api/public/help-centre/articles?popular=1&limit=6"),
    );
    expect(res.status).toBe(200);
    const args = prismaMock.helpArticle.findMany.mock.calls[0][0];
    expect(args.orderBy[0]).toEqual({ viewCount: "desc" });
    expect(args.take).toBe(6);
  });

  it("400 on an invalid limit", async () => {
    const res = await ARTICLES_GET(
      createRequest("GET", "/api/public/help-centre/articles?limit=0"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/public/help-centre/tickets", () => {
  const validBody = {
    name: "Sara Khan",
    email: "Sara@Example.com",
    phone: "0400 000 000",
    subject: "Changing booked days",
    message: "Can we move Tuesday to Wednesday?",
  };

  it("400 when required fields are missing", async () => {
    const res = await TICKETS_POST(
      createRequest("POST", "/api/public/help-centre/tickets", {
        body: { name: "Sara" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("400 on an invalid email", async () => {
    const res = await TICKETS_POST(
      createRequest("POST", "/api/public/help-centre/tickets", {
        body: { ...validBody, email: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("silently 200s when honeypot field is filled", async () => {
    const res = await TICKETS_POST(
      createRequest("POST", "/api/public/help-centre/tickets", {
        body: { ...validBody, website: "http://spam.example" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
    expect(prismaMock.whatsAppContact.create).not.toHaveBeenCalled();
  });

  it("429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetIn: 60 });
    const res = await TICKETS_POST(
      createRequest("POST", "/api/public/help-centre/tickets", { body: validBody }),
    );
    expect(res.status).toBe(429);
  });

  it("creates a stub contact and a portal ticket with an inbound message", async () => {
    prismaMock.whatsAppContact.findUnique.mockResolvedValue(null);
    prismaMock.whatsAppContact.create.mockResolvedValue({ id: "c-1" });
    prismaMock.supportTicket.create.mockResolvedValue({ ticketNumber: 42 });

    const res = await TICKETS_POST(
      createRequest("POST", "/api/public/help-centre/tickets", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ ok: true, ticketNumber: 42 });

    // Contact keyed by lowercased email
    const contactArg = prismaMock.whatsAppContact.create.mock.calls[0][0];
    expect(contactArg.data.waId).toBe("help-sara@example.com");
    expect(contactArg.data.parentName).toBe("Sara Khan");

    const ticketArg = prismaMock.supportTicket.create.mock.calls[0][0];
    expect(ticketArg.data.contactId).toBe("c-1");
    expect(ticketArg.data.source).toBe("portal");
    expect(ticketArg.data.subject).toBe("Changing booked days");
    expect(ticketArg.data.tags).toEqual(["help-centre"]);
    expect(ticketArg.data.messages.create.direction).toBe("inbound");
    expect(ticketArg.data.messages.create.body).toContain("Can we move Tuesday to Wednesday?");
    expect(ticketArg.data.messages.create.body).toContain("sara@example.com");
  });

  it("reuses an existing contact for a repeat submitter", async () => {
    prismaMock.whatsAppContact.findUnique.mockResolvedValue({ id: "c-existing" });
    prismaMock.supportTicket.create.mockResolvedValue({ ticketNumber: 43 });

    const res = await TICKETS_POST(
      createRequest("POST", "/api/public/help-centre/tickets", { body: validBody }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.whatsAppContact.create).not.toHaveBeenCalled();
    const ticketArg = prismaMock.supportTicket.create.mock.calls[0][0];
    expect(ticketArg.data.contactId).toBe("c-existing");
  });
});
