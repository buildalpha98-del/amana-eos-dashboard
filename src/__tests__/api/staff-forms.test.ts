/**
 * Staff compliance forms (Daniel, 20 Oct 2026): Staff Record for everyone,
 * Responsible Person for those holding the position, countersigned by the
 * centre's coordinator or a State Manager.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));

import { GET } from "@/app/api/staff-forms/[userId]/route";
import { PUT } from "@/app/api/staff-forms/[userId]/[type]/route";
import { POST as COUNTERSIGN } from "@/app/api/staff-forms/[userId]/[type]/countersign/route";
import { formStatus, formsFor, responsiblePersonSchema, staffRecordSchema } from "@/lib/staff-forms";

const SIG = "data:image/png;base64,AAAA";
const ctx = (userId: string, type?: string) => ({ params: Promise.resolve({ userId, ...(type ? { type } : {}) }) }) as never;

const staffRecord = {
  fullName: "Sarah Khan",
  dateOfBirth: "1995-03-02",
  address: "1 Test St, Greenacre NSW 2190",
  qualifications: "Diploma of Early Childhood",
  qualificationCopiesAttached: true,
  otherTraining: "First Aid, GECCKO",
  trainingCopiesAttached: true,
  wwccNumber: "WWC1234567E",
  wwccExpiry: "2029-01-01",
  emergencyName: "Ali Khan",
  emergencyRelationship: "Husband",
  emergencyPhone: "0400 000 000",
};
const no = "no" as const;
const rp = {
  fullName: "Sarah Khan",
  dateOfBirth: "1995-03-02",
  address: "1 Test St",
  mobile: "0400 000 000",
  email: "sarah@example.test",
  otherName: no,
  otherFamilyName: "",
  otherGivenName: "",
  wwccNumber: "WWC1234567E",
  wwccExpiry: "2029-01-01",
  childProtectionCourseNumber: "CHC123",
  childSafetyTrainingDate: "2026-01-10",
  fpConvictions: no,
  fpBankruptcy: no,
  fpDirectorAdministration: no,
  fpConflictOfInterest: no,
  fpOtherInfo: "",
  chDisciplinary: no,
  chDisciplinaryDetails: "",
  chProhibitionNotice: no,
  chProhibitionNoticeDetails: "",
  chLicenceRefused: no,
  chLicenceRefusedDetails: "",
  pnCurrentProhibition: no,
  pnCurrentProhibitionDetails: "",
  pnRestricted: no,
  pnRestrictedDetails: "",
  declarationAccepted: true,
};

/** Users: s1 educator at svc-1 (RP position), d1 coordinator at svc-1, d2 at svc-2. */
function users() {
  prismaMock.user.findUnique.mockImplementation(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
    if (select?.active) return { active: true };
    const all: Record<string, { id: string; serviceId: string | null; positions: string[]; name: string; service: { name: string } }> = {
      s1: { id: "s1", serviceId: "svc-1", positions: ["responsible_person"], name: "Sarah Khan", service: { name: "Amana OSHC MFIS Greenacre" } },
      s2: { id: "s2", serviceId: "svc-1", positions: [], name: "Omar", service: { name: "Amana OSHC MFIS Greenacre" } },
      d1: { id: "d1", serviceId: "svc-1", positions: [], name: "Dir One", service: { name: "x" } },
      d2: { id: "d2", serviceId: "svc-2", positions: [], name: "Dir Two", service: { name: "y" } },
    };
    return all[where.id] ?? null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  users();
  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
  prismaMock.staffForm.findMany.mockResolvedValue([]);
  prismaMock.emergencyContact.findFirst.mockResolvedValue(null);
  prismaMock.complianceCertificate.findFirst.mockResolvedValue(null);
  prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
  prismaMock.staffQualification.findMany.mockResolvedValue([]);
  prismaMock.staffForm.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: "f1",
    type: create.type,
    submittedAt: create.submittedAt ?? null,
    supervisorSignedAt: null,
    updatedAt: new Date(),
  }));
  prismaMock.activityLog.create.mockResolvedValue({});
});

describe("which forms, and status", () => {
  it("Staff Record for everyone; Responsible Person only with the position", () => {
    expect(formsFor([])).toEqual(["staff_record"]);
    expect(formsFor(["responsible_person"])).toEqual(["staff_record", "responsible_person"]);
  });
  it("Responsible Person needs the supervisor to be complete", () => {
    const at = new Date();
    expect(formStatus({ type: "staff_record", submittedAt: at, supervisorSignedAt: null })).toBe("complete");
    expect(formStatus({ type: "responsible_person", submittedAt: at, supervisorSignedAt: null })).toBe("awaiting_supervisor");
    expect(formStatus({ type: "responsible_person", submittedAt: at, supervisorSignedAt: at })).toBe("complete");
  });
  it("submit validation: complete forms pass; 'yes' answers need details", () => {
    expect(staffRecordSchema.safeParse(staffRecord).success).toBe(true);
    expect(responsiblePersonSchema.safeParse(rp).success).toBe(true);
    const r = responsiblePersonSchema.safeParse({ ...rp, chDisciplinary: "yes" });
    expect(r.success).toBe(false);
    expect(responsiblePersonSchema.safeParse({ ...rp, declarationAccepted: false }).success).toBe(false);
  });
});

describe("GET — same visibility as certificates", () => {
  it("the staff member sees both forms, pre-filled, and can edit", async () => {
    mockSession({ id: "s1", name: "Sarah", role: "staff", serviceId: "svc-1" });
    const body = await (await GET(createRequest("GET", "/api/staff-forms/s1"), ctx("s1"))).json();
    expect(body.canEdit).toBe(true);
    expect(body.canCountersign).toBe(false);
    expect(body.forms.map((f: { type: string }) => f.type)).toEqual(["staff_record", "responsible_person"]);
    expect(body.forms[0].data.fullName).toBe("Sarah Khan");
  });
  it("their centre's coordinator can view and countersign; can't edit", async () => {
    mockSession({ id: "d1", name: "Dir", role: "member", serviceId: "svc-1" });
    const body = await (await GET(createRequest("GET", "/api/staff-forms/s1"), ctx("s1"))).json();
    expect(body).toMatchObject({ canEdit: false, canCountersign: true });
  });
  it("another educator, or another centre's coordinator, is refused", async () => {
    mockSession({ id: "s2", name: "Omar", role: "staff", serviceId: "svc-1" });
    expect((await GET(createRequest("GET", "/api/staff-forms/s1"), ctx("s1"))).status).toBe(403);
    mockSession({ id: "d2", name: "Dir Two", role: "member", serviceId: "svc-2" });
    expect((await GET(createRequest("GET", "/api/staff-forms/s1"), ctx("s1"))).status).toBe(403);
  });
});

describe("PUT — only the staff member fills in their own", () => {
  const put = (userId: string, type: string, body: unknown) =>
    PUT(createRequest("PUT", `/api/staff-forms/${userId}/${type}`, { body }), ctx(userId, type));

  it("saves a draft with no checks", async () => {
    mockSession({ id: "s2", name: "Omar", role: "staff", serviceId: "svc-1" });
    const res = await put("s2", "staff_record", { data: { fullName: "Om" } });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("draft");
  });
  it("submitting validates and needs a signature", async () => {
    mockSession({ id: "s2", name: "Omar", role: "staff", serviceId: "svc-1" });
    expect((await put("s2", "staff_record", { data: { fullName: "Om" }, submit: true, signature: SIG })).status).toBe(400);
    expect((await put("s2", "staff_record", { data: staffRecord, submit: true })).status).toBe(400);
    const ok = await put("s2", "staff_record", { data: staffRecord, submit: true, signature: SIG });
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("complete");
    const call = prismaMock.staffForm.upsert.mock.calls.at(-1)![0];
    expect(call.update).toMatchObject({ staffSignatureDataUrl: SIG, serviceId: "svc-1", supervisorSignedAt: null });
  });
  it("nobody else can fill it in — not even their coordinator", async () => {
    mockSession({ id: "d1", name: "Dir", role: "member", serviceId: "svc-1" });
    expect((await put("s1", "staff_record", { data: staffRecord })).status).toBe(403);
  });
  it("the Responsible Person form needs the position", async () => {
    mockSession({ id: "s2", name: "Omar", role: "staff", serviceId: "svc-1" });
    expect((await put("s2", "responsible_person", { data: rp, submit: true, signature: SIG })).status).toBe(403);
  });
});

describe("countersign — the centre's coordinator or a State Manager", () => {
  const sign = (body: unknown = { signature: SIG, documentsViewed: ["passport", "criminalHistory"] }) =>
    COUNTERSIGN(createRequest("POST", "/api/staff-forms/s1/responsible_person/countersign", { body }), ctx("s1", "responsible_person"));

  beforeEach(() => {
    prismaMock.staffForm.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.staffForm.findUnique.mockResolvedValue({ id: "f1", type: "responsible_person", submittedAt: new Date(), supervisorSignedAt: new Date() });
  });

  it("the centre's coordinator signs, ticking the documents viewed", async () => {
    mockSession({ id: "d1", name: "Dir One", role: "member", serviceId: "svc-1" });
    const res = await sign();
    expect(res.status).toBe(200);
    expect(prismaMock.staffForm.updateMany.mock.calls[0][0].data).toMatchObject({
      supervisorSignedById: "d1",
      supervisorName: "Dir One",
      documentsViewed: ["passport", "criminalHistory"],
    });
  });
  it("a State Manager can sign for any centre", async () => {
    mockSession({ id: "ho", name: "State Manager", role: "head_office" });
    expect((await sign()).status).toBe(200);
  });
  it("another centre's coordinator, an educator, or the person themselves can't", async () => {
    mockSession({ id: "d2", name: "Dir Two", role: "member", serviceId: "svc-2" });
    expect((await sign()).status).toBe(403);
    mockSession({ id: "s2", name: "Omar", role: "staff", serviceId: "svc-1" });
    expect((await sign()).status).toBe(403);
    mockSession({ id: "s1", name: "Sarah", role: "staff", serviceId: "svc-1" });
    expect((await sign()).status).toBe(403);
  });
  it("only once the form is submitted", async () => {
    mockSession({ id: "d1", name: "Dir One", role: "member", serviceId: "svc-1" });
    prismaMock.staffForm.updateMany.mockResolvedValue({ count: 0 });
    expect((await sign()).status).toBe(409);
  });
});
