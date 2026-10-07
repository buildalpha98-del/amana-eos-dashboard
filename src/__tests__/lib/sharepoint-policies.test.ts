import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

const listFolderFiles = vi.fn();
const downloadAsPdf = vi.fn(async () => Buffer.from("%PDF"));
vi.mock("@/lib/ms-graph", () => ({
  isGraphConfigured: () => true,
  listFolderFiles: (...a: unknown[]) => listFolderFiles(...a),
  downloadAsPdf: (...a: unknown[]) => downloadAsPdf(...(a as [])),
}));
vi.mock("@/lib/storage/uploadFile", () => ({
  uploadFile: vi.fn(async (_b: unknown, path: string) => `https://blob.test/${path}`),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { parsePolicyFile, pickWinners, runSharepointPolicySync } from "@/lib/sharepoint-policies";

const file = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  cTag: `c-${id}`,
  webUrl: `https://sp/${name}`,
  lastModifiedDateTime: "2026-08-01T00:00:00Z",
  file: {},
  parentReference: { path: "/drive/root:/NSW & VIC state policies/Policies" },
  ...extra,
});

describe("parsePolicyFile — real Amana file names", () => {
  it.each([
    ["QA2 Sun Safe Policy OSHC V14.docx", "Sun Safe Policy", 14, 2, null],
    ["QA4 Responsible Person Policy OSHC V11.docx", "Responsible Person Policy", 11, 4, null],
    ["QA2 Bushfire Policy NSW OSHC V11.docx", "Bushfire Policy (NSW)", 11, 2, "NSW"],
    ["QA5 Interactions with Children Families and Staff Policy OSHC V12.docx", "Interactions with Children Families and Staff Policy", 12, 5, null],
    ["QA4 Protected Disclosures Whistleblower Policy OSHC V2.docx", "Protected Disclosures Whistleblower Policy", 2, 4, null],
  ])("%s", (name, title, version, qa, state) => {
    const p = parsePolicyFile(name, "/drive/root:/NSW & VIC state policies/Policies");
    expect(p).toMatchObject({ title, version, qualityArea: qa, state, category: "policy" });
  });

  it("files under Procedures are procedures", () => {
    expect(parsePolicyFile("Medication Procedure V3.docx", "/x/Procedures").category).toBe("procedure");
  });
});

describe("pickWinners", () => {
  it("keeps the highest version when a policy appears twice", () => {
    const w = pickWinners([
      file("a", "QA2 Diabetes Management Policy OSHC V9.docx") as never,
      file("b", "QA2 Diabetes Management Policy OSHC V10.docx") as never,
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].item.id).toBe("b");
  });

  it("treats 'Bush Fire' and 'Bushfire' as the same policy", () => {
    const w = pickWinners([
      file("a", "QA2 Bush Fire Policy NSW OSHC V10.docx") as never,
      file("b", "QA2 Bushfire Policy NSW OSHC V11.docx") as never,
    ]);
    expect(w.map((x) => x.item.id)).toEqual(["b"]);
  });

  it("ignores files that aren't documents", () => {
    expect(pickWinners([file("a", "Lockdown p2.jpeg") as never])).toEqual([]);
  });
});

describe("runSharepointPolicySync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.policyDocument.create.mockResolvedValue({ id: "new-doc" } as never);
    prismaMock.policyDocumentVersion.create.mockResolvedValue({ id: "ver-1" } as never);
    prismaMock.policyDocument.update.mockResolvedValue({} as never);
    prismaMock.policyDocument.updateMany.mockResolvedValue({ count: 0 } as never);
  });

  it("refuses to run against an empty listing (would archive everything)", async () => {
    listFolderFiles.mockResolvedValue([]);
    await expect(runSharepointPolicySync()).rejects.toThrow(/refusing/);
    expect(prismaMock.policyDocument.updateMany).not.toHaveBeenCalled();
  });

  it("creates a new policy as reference-only (no signature) with version 1", async () => {
    listFolderFiles.mockResolvedValue([file("a", "QA2 Sun Safe Policy OSHC V14.docx")]);
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
    const r = await runSharepointPolicySync();
    expect(r.created).toBe(1);
    expect(prismaMock.policyDocument.create.mock.calls[0][0].data).toMatchObject({
      title: "Sun Safe Policy",
      requiresAcknowledgement: false,
      sharepointItemId: "a",
      description: "Quality Area 2",
    });
    expect(prismaMock.policyDocumentVersion.create.mock.calls[0][0].data).toMatchObject({ versionNumber: 1 });
  });

  it("leaves an unchanged policy alone", async () => {
    listFolderFiles.mockResolvedValue([file("a", "QA2 Sun Safe Policy OSHC V14.docx")]);
    prismaMock.policyDocument.findMany.mockResolvedValue([
      { id: "d1", title: "Sun Safe Policy", sharepointItemId: "a", sharepointETag: "c-a", isArchived: false },
    ] as never);
    const r = await runSharepointPolicySync();
    expect(r.unchanged).toBe(1);
    expect(downloadAsPdf).not.toHaveBeenCalled();
  });

  it("adds a new version when SharePoint has a newer file, adopting by title", async () => {
    listFolderFiles.mockResolvedValue([file("b", "QA2 Sun Safe Policy OSHC V15.docx")]);
    prismaMock.policyDocument.findMany.mockResolvedValue([
      { id: "d1", title: "Sun Safe Policy", sharepointItemId: "a", sharepointETag: "c-a", isArchived: false },
    ] as never);
    prismaMock.policyDocumentVersion.findFirst.mockResolvedValue({ versionNumber: 3 } as never);
    const r = await runSharepointPolicySync();
    expect(r.updated).toBe(1);
    expect(prismaMock.policyDocumentVersion.create.mock.calls[0][0].data).toMatchObject({ documentId: "d1", versionNumber: 4 });
    expect(r.archived).toBe(0);
  });

  it("archives (never deletes) a synced policy that left SharePoint", async () => {
    listFolderFiles.mockResolvedValue([file("a", "QA2 Sun Safe Policy OSHC V14.docx")]);
    prismaMock.policyDocument.findMany.mockResolvedValue([
      { id: "d1", title: "Sun Safe Policy", sharepointItemId: "a", sharepointETag: "c-a", isArchived: false },
      { id: "d2", title: "Old Policy", sharepointItemId: "zz", sharepointETag: "x", isArchived: false },
      { id: "d3", title: "Hand-uploaded", sharepointItemId: null, sharepointETag: null, isArchived: false },
    ] as never);
    const r = await runSharepointPolicySync();
    expect(r.archived).toBe(1);
    expect(prismaMock.policyDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["d2"] } },
      data: { isArchived: true },
    });
  });

  it("converts at most a batch per run and reports the rest as pending", async () => {
    listFolderFiles.mockResolvedValue([
      file("a", "QA1 A Policy V1.docx"),
      file("b", "QA1 B Policy V1.docx"),
      file("c", "QA1 C Policy V1.docx"),
    ]);
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
    const r = await runSharepointPolicySync({ batch: 2 });
    expect(downloadAsPdf).toHaveBeenCalledTimes(2);
    expect(r.pending).toBe(1);
  });
});
