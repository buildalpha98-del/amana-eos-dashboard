/**
 * Import families + children from an OWNA "Data" export (xlsx) into the
 * dashboard — Families section (ParentAccount + EnrolmentSubmission) and
 * Children section (Child rows per centre).
 *
 * 2026-09-14, per Jayden: "import every single data into our dashboard.
 * Don't create them account just yet… none of these will receive an email."
 *
 * What it does, per spreadsheet row (one row = one child at one centre):
 *   - Child row at the mapped Service with name, DOB, gender, address, CRN,
 *     Medicare, room (branded), booking prefs (sessions, days, fee, OWNA
 *     enrolment id), allergies flag, tags, status.
 *   - One EnrolmentSubmission per (primary-parent email, centre) carrying
 *     both parents' details + the children, status "processed",
 *     referralSource "owna_import" (the idempotency marker).
 *   - One ParentAccount per primary-parent email so the family shows in
 *     /families: UNVERIFIED, no email sent, password is an unusable random
 *     hash — they can only get in via the magic link when invited later.
 *
 * Dedupe (safe to re-run):
 *   - Child: skipped when the same centre already has a child with the same
 *     (real) CRN, or the same first+last name and DOB.
 *   - ParentAccount: never touched when the email already exists.
 *   - EnrolmentSubmission: only created when at least one child is new.
 *
 * Usage (DRY RUN by default — prints what it would do, writes nothing):
 *   npx tsx scripts/import-owna-families.ts --file /path/to/export.xlsx
 *   DATABASE_URL="$PROD_DATABASE_URL_UNPOOLED" npx tsx scripts/import-owna-families.ts --file … --apply
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { writeFileSync } from "fs";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

// ── args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileArg = args[args.indexOf("--file") + 1];
const APPLY = args.includes("--apply");
const REPORT = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;
if (!fileArg || args.indexOf("--file") === -1) {
  console.error("Usage: --file <xlsx> [--apply] [--report out.json]");
  process.exit(1);
}

const CENTRE_TO_CODE: Record<string, string> = {
  "amana oshc greenacre": "MFIS-GA",
  "amana oshc beaumont hills": "MFIS-BH",
  "amana oshc hoxton park": "MFIS-HP",
  "amana oshc arkana college kingsgrove": "ARK",
  "amana oshc unity grammar": "UG",
  "amana oshc minaret doveton": "MIN-DOV",
  "amana oshc minaret officer": "MIN-OFF",
  "amana oshc al taqwa college": "ATC",
  "amana oshc aia coburg": "AIA-COB",
  "amana oshc minaret springvale": "MIN-SPR",
  "amana oshc minarah college": "MNC",
};
const CODE_STATE: Record<string, string> = {
  "MFIS-GA": "NSW", "MFIS-BH": "NSW", "MFIS-HP": "NSW", ARK: "NSW", UG: "NSW", MNC: "NSW",
  "MIN-DOV": "VIC", "MIN-OFF": "VIC", ATC: "VIC", "AIA-COB": "VIC", "MIN-SPR": "VIC",
};

// OWNA room label → { branded room, session code }
function mapRoom(raw: string | null): { room: string | null; session: "bsc" | "asc" | "vc" | null } {
  const r = (raw ?? "").trim().toLowerCase();
  if (!r) return { room: null, session: null };
  if (r.includes("before") || r.includes("rise")) return { room: "Rise and Shine", session: "bsc" };
  if (r.includes("holiday") || r.includes("vacation")) return { room: "Holiday Quest", session: "vc" };
  if (r.includes("after") || r.includes("afternoon") || r.includes("pupil free")) return { room: "Amana Afternoons", session: "asc" };
  return { room: raw!.trim(), session: null };
}
function sessionFromTime(t: string | null): "bsc" | "asc" | "vc" | null {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec((t ?? "").trim());
  if (!m) return null;
  const start = Number(m[1]), end = Number(m[3]);
  if (start < 10 && end <= 10) return "bsc";
  if (start < 10 && end >= 16) return "vc";
  if (start >= 12) return "asc";
  return null;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : null;
};
const isAllCaps = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s);
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, (_, p, c) => p + c.toUpperCase());
const name = (v: unknown): string | null => {
  // OWNA sometimes carries a stray digit on a name ("Mukit1").
  const s = str(v)?.replace(/\d+$/, "").trim() || null;
  if (!s) return null;
  return isAllCaps(s) ? titleCase(s) : s;
};
/** "Muhammad-Ali" ≡ "MUHAMMAD ALI"; "Nayel" ≡ "Nayel Ibrahim" (same first token). */
const sameFirstName = (a: string, b: string): boolean => {
  const all = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const tok = (s: string) => s.toUpperCase().split(/[\s\-]+/)[0] ?? "";
  return all(a) === all(b) || (tok(a).length > 0 && tok(a) === tok(b));
};
const lowerEmail = (v: unknown): string | null => {
  const s = str(v)?.toLowerCase() ?? null;
  return s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null;
};
const normCrn = (v: unknown): string | null => {
  const s = (str(v) ?? "").replace(/\s/g, "").toUpperCase();
  if (!s) return null;
  if (/^(\d)\1*[A-Z]?$/.test(s)) return null; // placeholder like 000000000X / 999999999X
  return s;
};
const isoDate = (v: unknown): Date | null => {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
};
const normState = (v: unknown, postcode: string | null, fallback: string): string => {
  const s = (str(v) ?? "").toUpperCase();
  if (s.startsWith("VIC")) return "VIC";
  if (s.startsWith("NSW")) return "NSW";
  if (s.startsWith("QLD")) return "QLD";
  if (postcode?.startsWith("2")) return "NSW";
  if (postcode?.startsWith("3")) return "VIC";
  return fallback;
};
const yes = (v: unknown) => /^(yes|true|y)$/i.test(str(v) ?? "");
const DAYS: Array<[string, string]> = [["Mon", "monday"], ["Tue", "tuesday"], ["Wed", "wednesday"], ["Thu", "thursday"], ["Fri", "friday"], ["Sat", "saturday"], ["Sun", "sunday"]];
const splitTags = (v: unknown): string[] =>
  (str(v) ?? "").split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);

type Row = Record<string, string | null>;

function buildParent(r: Row, p: "Parent" | "Parent2", fallbackState: string) {
  const first = name(r[`${p}/First Name`]);
  const last = name(r[`${p}/Last Name`]);
  if (!first && !last) return null;
  const postcode = str(r[`${p}/Postcode`]);
  return {
    firstName: first ?? "",
    surname: last ?? "",
    dob: str(r[`${p}/DOB`]) ?? "",
    email: lowerEmail(r[`${p}/Email`]) ?? (p === "Parent" ? lowerEmail(r["Parent/Phone"]) ?? "" : ""),
    mobile: lowerEmail(r[`${p}/Phone`]) ? "" : str(r[`${p}/Phone`]) ?? "",
    street: str(r[`${p}/Address`]) ?? "",
    suburb: name(r[`${p}/Suburb`]) ?? "",
    state: normState(r[`${p}/State`], postcode, fallbackState),
    postcode: postcode ?? "",
    address: [str(r[`${p}/Address`]), name(r[`${p}/Suburb`]), postcode].filter(Boolean).join(", "),
    crn: normCrn(r[`${p}/CRN`]) ?? "",
    relationship: "Parent",
    ownaUsername: str(r[`${p}/UserName`]) ?? "",
    ownaAccountName: str(r[`${p}/Account Name`]) ?? "",
    ownaAccountTags: splitTags(r[`${p}/Account Tags`]),
    ownaDateAdded: str(r[`${p} Date Added`]) ?? "",
  };
}

function billingFrequency(tags: string[]): string | null {
  const t = tags.map((x) => x.toLowerCase());
  if (t.some((x) => x.startsWith("fortnight"))) return "fortnightly";
  if (t.includes("weekly")) return "weekly";
  return null;
}

async function main() {
  const wb = XLSX.readFile(fileArg);
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${rows.length} rows from ${fileArg}`);
  console.log(`DB host: ${(process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\?.*$/, "")}`);

  const services = await prisma.service.findMany({ select: { id: true, code: true, name: true } });
  const byCode = new Map(services.map((s) => [s.code, s]));
  for (const code of new Set(Object.values(CENTRE_TO_CODE))) {
    if (!byCode.has(code)) throw new Error(`Service code ${code} not found in this database`);
  }

  // Existing data for dedupe.
  const existingKids = await prisma.child.findMany({
    select: { id: true, firstName: true, surname: true, dob: true, crn: true, serviceId: true },
  });
  const kidKey = (f: string, s: string, dob: Date | null, serviceId: string | null) =>
    `${f.trim().toUpperCase()}|${s.trim().toUpperCase()}|${dob ? dob.toISOString().slice(0, 10) : ""}|${serviceId}`;
  const kidByName = new Set(existingKids.map((k) => kidKey(k.firstName, k.surname, k.dob, k.serviceId)));
  // CRN alone is NOT identity: OWNA has siblings (even twins) sharing one
  // CRN, plus placeholders. A CRN match counts as the same child only when
  // the FIRST name matches and either the surname matches or the DOB is
  // within 2 days (portal-entered DOBs are off by a day; a few are typos).
  const kidByCrn = new Map<string, Array<{ firstName: string; surname: string; dob: Date | null }>>();
  for (const k of existingKids) {
    const c = normCrn(k.crn);
    if (!c) continue;
    const key = `${c}|${k.serviceId}`;
    if (!kidByCrn.has(key)) kidByCrn.set(key, []);
    kidByCrn.get(key)!.push({ firstName: k.firstName, surname: k.surname.trim().toUpperCase(), dob: k.dob });
  }
  const crnMatches = (crn: string | null, serviceId: string, firstName: string, surname: string, dob: Date | null): boolean => {
    if (!crn) return false;
    const list = kidByCrn.get(`${crn}|${serviceId}`) ?? [];
    return list.some((e) => {
      if (!sameFirstName(e.firstName, firstName)) return false;
      if (e.surname === surname.trim().toUpperCase()) return true;
      if (!e.dob || !dob) return false;
      return Math.abs(e.dob.getTime() - dob.getTime()) <= 2 * 86_400_000;
    });
  };
  const existingEmails = new Set((await prisma.parentAccount.findMany({ select: { email: true } })).map((a) => a.email));
  // Enrolments a previous (partial) run of this script already created, so
  // a sibling picked up on re-run joins the family's existing centre record.
  const priorImports = await prisma.enrolmentSubmission.findMany({
    where: { referralSource: "owna_import" },
    select: { id: true, serviceId: true, primaryParent: true, children: true },
  });
  const priorByFamilyService = new Map<string, { id: string; children: unknown[] }>();
  for (const e of priorImports) {
    const email = String((e.primaryParent as Record<string, unknown> | null)?.email ?? "").toLowerCase().trim();
    if (!email || !e.serviceId) continue;
    priorByFamilyService.set(`${email}|${e.serviceId}`, { id: e.id, children: Array.isArray(e.children) ? (e.children as unknown[]) : [] });
  }

  // Group: family (primary email) → centre → rows
  type FamilyGroup = { key: string; email: string | null; rows: Row[]; byService: Map<string, Row[]> };
  const families = new Map<string, FamilyGroup>();
  const unmappedCentres = new Set<string>();
  let testRowsSkipped = 0;
  for (const r of rows) {
    // OWNA's own review/test children — not families.
    if (/^test\b/i.test(str(r["Account"]) ?? "") || /^test\b/i.test(str(r["First Name"]) ?? "")) { testRowsSkipped++; continue; }
    const code = CENTRE_TO_CODE[(str(r["Centre"]) ?? "").toLowerCase()];
    if (!code) { unmappedCentres.add(str(r["Centre"]) ?? "(blank)"); continue; }
    // A handful of OWNA rows have the email typed into the phone column, or
    // only the second parent has an address — use what's there.
    const email = lowerEmail(r["Parent/Email"]) ?? lowerEmail(r["Parent/Phone"]) ?? lowerEmail(r["Parent2/Email"]);
    const key = email ?? `noemail:${(str(r["Account"]) ?? "")}:${(str(r["Parent/First Name"]) ?? "")} ${(str(r["Parent/Last Name"]) ?? "")}`.toLowerCase();
    let fam = families.get(key);
    if (!fam) { fam = { key, email, rows: [], byService: new Map() }; families.set(key, fam); }
    fam.rows.push(r);
    const sid = byCode.get(code)!.id;
    if (!fam.byService.has(sid)) fam.byService.set(sid, []);
    fam.byService.get(sid)!.push(r);
  }
  if (unmappedCentres.size) throw new Error(`Unmapped centres: ${[...unmappedCentres].join(", ")}`);

  const report = {
    dryRun: !APPLY,
    rows: rows.length,
    testRowsSkipped,
    families: families.size,
    familiesWithoutEmail: [...families.values()].filter((f) => !f.email).length,
    accountsCreated: 0,
    accountsExisting: 0,
    enrolmentsCreated: 0,
    childrenCreated: 0,
    childrenSkippedExisting: 0,
    skipped: [] as Array<{ child: string; centre: string; reason: string }>,
    noEmailFamilies: [] as string[],
    perService: {} as Record<string, number>,
  };

  const now = new Date();
  const seenInRun = new Set<string>();

  for (const fam of families.values()) {
    const firstRow = fam.rows[0];
    const anyCode = CENTRE_TO_CODE[(str(firstRow["Centre"]) ?? "").toLowerCase()];
    const primary = buildParent(firstRow, "Parent", CODE_STATE[anyCode]);
    const secondary = buildParent(firstRow, "Parent2", CODE_STATE[anyCode]);
    const accountName = name(firstRow["Parent/Account Name"]) ?? name(firstRow["Account"]) ?? primary?.surname ?? null;
    const accountTags = splitTags(firstRow["Parent/Account Tags"]);

    // ── Parent account (once per family) ──
    if (fam.email) {
      if (existingEmails.has(fam.email)) {
        report.accountsExisting++;
      } else {
        report.accountsCreated++;
        if (APPLY) {
          await prisma.parentAccount.create({
            data: {
              email: fam.email,
              // Unusable: 32 random bytes nobody knows. Login is only
              // possible via the magic link once the family is invited.
              passwordHash: await hash(randomBytes(32).toString("hex"), 10),
              firstName: primary?.firstName || null,
              surname: primary?.surname || null,
              familyName: accountName,
              billingFrequency: billingFrequency(accountTags),
              billingNotes: accountTags.length ? `OWNA account tags: ${accountTags.join(", ")}` : null,
            },
          });
          existingEmails.add(fam.email);
        }
      }
    } else {
      report.noEmailFamilies.push(`${primary?.firstName ?? ""} ${primary?.surname ?? ""} (account ${str(firstRow["Account"]) ?? "?"})`);
    }

    // ── One enrolment per centre ──
    for (const [serviceId, srows] of fam.byService) {
      const svc = services.find((s) => s.id === serviceId)!;
      const state = CODE_STATE[svc.code];
      const childrenData: Prisma.ChildCreateManyInput[] = [];
      const childrenJson: Record<string, unknown>[] = [];

      for (const r of srows) {
        const first = name(r["First Name"]) ?? "";
        const last = name(r["Last Name"]) ?? "";
        const dob = isoDate(r["DOB"]);
        const crn = normCrn(r["CRN"]);
        const label = `${first} ${last}`;
        const nameK = kidKey(first, last, dob, serviceId);
        if (kidByName.has(nameK) || crnMatches(crn, serviceId, first, last, dob) || seenInRun.has(nameK)) {
          report.childrenSkippedExisting++;
          report.skipped.push({ child: label, centre: svc.code, reason: seenInRun.has(nameK) ? "duplicate row in sheet" : "already in dashboard" });
          continue;
        }
        seenInRun.add(nameK);

        const postcode = str(r["Child/Postcode"]);
        const address = {
          street: str(r["Child/Address"]) ?? "",
          suburb: name(r["Child/Suburb"]) ?? "",
          state: normState(r["Child/State"], postcode, state),
          postcode: postcode ?? "",
        };
        const { room, session: roomSession } = mapRoom(r["Room"]);
        const sessions = [str(r["Session of Care1"]), str(r["Session of Care2"])].filter((s): s is string => !!s);
        const sessionTypes = [...new Set([roomSession, ...sessions.map(sessionFromTime)].filter((s): s is "bsc" | "asc" | "vc" => !!s))];
        const days = DAYS.filter(([col]) => yes(r[col])).map(([, d]) => d);
        const startDate = str(r["Official Start Date"]) ?? str(r["Active From Date"]);
        const finish = isoDate(r["Finish Date"]);
        const allergies = yes(r["Allergies"]);
        const tags = [...new Set([...splitTags(r["Tags"]), ...(allergies ? ["Allergies"] : [])])];
        const bookingPrefs = {
          sessionTypes,
          days: Object.fromEntries(sessionTypes.map((t) => [t, days])),
          bookingType: days.length ? "permanent" : "casual",
          startDate: startDate ?? "",
          serviceId,
          sessions,
          fee: str(r["Fee"]),
          ownaEnrolmentId: str(r["Enrolment Id"]),
          ownaRoom: str(r["Room"]),
          ownaDateAdded: str(r["Date Added"]),
          finishDate: finish ? finish.toISOString().slice(0, 10) : null,
        };
        const medical = {
          allergies,
          medicareNumber: str(r["Medicare #"]) ?? "",
          medicareExpiry: str(r["Medicare Exp"]) ?? "",
          medicareRef: str(r["Medicare Ref"]) ?? "",
          source: "owna_import",
        };

        childrenData.push({
          serviceId,
          firstName: first,
          surname: last,
          preferredName: name(r["Preferred Name"]),
          dob,
          gender: str(r["Gender"])?.toUpperCase() === "M" ? "male" : str(r["Gender"])?.toUpperCase() === "F" ? "female" : null,
          address,
          crn,
          medicareNumber: str(r["Medicare #"]),
          medicareExpiry: isoDate(r["Medicare Exp"]),
          medicareRef: str(r["Medicare Ref"]),
          schoolName: str(r["School"]),
          room,
          ownaRoomName: str(r["Room"]),
          bookingPrefs,
          medical,
          tags,
          ccsStatus: accountTags.some((t) => /waiting for ccs/i.test(t)) ? "pending" : null,
          status: finish && finish < now ? "withdrawn" : "active",
          culturalBackground: [],
          medicalConditions: [],
          dietaryRequirements: [],
        });
        childrenJson.push({
          firstName: first,
          surname: last,
          middleName: name(r["Middle Name"]),
          preferredName: name(r["Preferred Name"]),
          dob: str(r["DOB"]),
          gender: childrenData[childrenData.length - 1].gender,
          ...address,
          crn: crn ?? "",
          school: str(r["School"]) ?? "",
          medical,
          bookingPrefs,
        });
      }

      if (childrenData.length === 0) continue;
      report.enrolmentsCreated++;
      report.childrenCreated += childrenData.length;
      report.perService[svc.code] = (report.perService[svc.code] ?? 0) + childrenData.length;

      const prior = fam.email ? priorByFamilyService.get(`${fam.email}|${serviceId}`) : undefined;
      if (prior) report.enrolmentsCreated--;
      if (APPLY && prior) {
        await prisma.$transaction(async (tx) => {
          await tx.enrolmentSubmission.update({
            where: { id: prior.id },
            data: { children: [...prior.children, ...childrenJson] as Prisma.InputJsonValue },
          });
          await tx.child.createMany({ data: childrenData.map((c) => ({ ...c, enrolmentId: prior.id })) });
        });
        prior.children.push(...childrenJson);
        for (const c of childrenData) kidByName.add(kidKey(c.firstName, c.surname, (c.dob as Date | null) ?? null, serviceId));
      } else if (APPLY) {
        await prisma.$transaction(async (tx) => {
          const sub = await tx.enrolmentSubmission.create({
            data: {
              serviceId,
              primaryParent: (primary ?? { firstName: "", surname: "" }) as Prisma.InputJsonValue,
              secondaryParent: secondary as Prisma.InputJsonValue | undefined,
              children: childrenJson as Prisma.InputJsonValue,
              emergencyContacts: [] as Prisma.InputJsonValue,
              consents: {} as Prisma.InputJsonValue,
              referralSource: "owna_import",
              status: "processed",
              processedAt: now,
              notes: `Imported from OWNA export on ${now.toISOString().slice(0, 10)} (pre-migration family). No portal invite sent. OWNA account: ${accountName ?? "?"}.`,
            },
            select: { id: true },
          });
          await tx.child.createMany({ data: childrenData.map((c) => ({ ...c, enrolmentId: sub.id })) });
        });
        for (const c of childrenData) {
          kidByName.add(kidKey(c.firstName, c.surname, (c.dob as Date | null) ?? null, serviceId));
        }
      }
    }
  }

  console.log(JSON.stringify({ ...report, skipped: report.skipped.length, skippedSample: report.skipped.slice(0, 15) }, null, 2));
  if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
