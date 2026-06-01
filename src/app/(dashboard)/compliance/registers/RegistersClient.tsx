"use client";

/**
 * NQF Registers — client UI.
 *
 * Three tabs:
 *   1. Staff register (Reg 145/148)        — wired, data-bearing
 *   2. Nominated supervisor (Reg 146)      — placeholder until a
 *      dedicated nomination/consent record lands
 *   3. Volunteers & students (Reg 147)     — placeholder until a
 *      Volunteer model exists
 *
 * Each tab is independent. The Staff tab supports service filtering
 * (single dropdown) and a CSV download (server-rendered for stable
 * column order — ACECQA inspectors get the same shape every time).
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Printer,
  Search,
  FileWarning,
  Users,
  UserCog,
  HeartHandshake,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRegisterRow } from "@/lib/nqf-registers";

export interface RegistersClientProps {
  initialRows: StaffRegisterRow[];
  services: Array<{ id: string; name: string; code: string }>;
  selectedServiceId: string | null;
}

type Tab = "staff" | "supervisor" | "volunteers";

const TABS: Array<{ key: Tab; label: string; reg: string; icon: typeof Users }> = [
  { key: "staff", label: "Staff register", reg: "Reg 145 / 148", icon: Users },
  { key: "supervisor", label: "Nominated supervisor", reg: "Reg 146", icon: UserCog },
  { key: "volunteers", label: "Volunteers & students", reg: "Reg 147", icon: HeartHandshake },
];

export function RegistersClient({
  initialRows,
  services,
  selectedServiceId,
}: RegistersClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("staff");
  const [filter, setFilter] = useState("");

  // Filter on full name / email / position so an inspector can quickly
  // verify a specific person they're asking about.
  const visibleRows = useMemo(() => {
    if (!filter.trim()) return initialRows;
    const q = filter.toLowerCase().trim();
    return initialRows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.positionHeld.toLowerCase().includes(q) ||
        (r.serviceName ?? "").toLowerCase().includes(q),
    );
  }, [initialRows, filter]);

  const exportHref =
    `/api/compliance/registers/staff/export` +
    (selectedServiceId ? `?serviceId=${encodeURIComponent(selectedServiceId)}` : "");

  const onServiceChange = (id: string | null) => {
    const params = new URLSearchParams();
    if (id) params.set("serviceId", id);
    const qs = params.toString();
    router.push(`/compliance/registers${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 print:p-0">
      {/* Header (hidden on print) */}
      <div className="print:hidden">
        <Link
          href="/compliance"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Compliance
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          NQF compliance registers
        </h1>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Registers required under the Education and Care Services National
          Regulations. Available for ACECQA inspection on demand. Each tab
          covers a specific regulation.
        </p>
      </div>

      {/* Tabs (hidden on print — printed register shows only its own table) */}
      <div className="print:hidden flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ key, label, reg, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span className="text-[10px] font-normal text-muted ml-1">
              {reg}
            </span>
          </button>
        ))}
      </div>

      {tab === "staff" && (
        <section data-testid="staff-register">
          {/* Action bar */}
          <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="search"
                  placeholder="Search name, email, position…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-border rounded-md bg-card w-72 focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
              <select
                value={selectedServiceId ?? ""}
                onChange={(e) => onServiceChange(e.target.value || null)}
                className="px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                data-testid="service-filter"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-surface"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <a
                href={exportHref}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
                data-testid="export-csv"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </a>
            </div>
          </div>

          {/* Printable heading — appears only on print */}
          <div className="hidden print:block mb-4">
            <h2 className="text-xl font-bold">
              Register of staff and educators
            </h2>
            <p className="text-sm">
              Education and Care Services National Regulations — Reg 145 & Reg 148
            </p>
            <p className="text-xs text-muted">
              Generated {new Date().toLocaleString("en-AU")} · {visibleRows.length}{" "}
              records
              {selectedServiceId &&
                ` · Service: ${
                  services.find((s) => s.id === selectedServiceId)?.name ?? "—"
                }`}
            </p>
          </div>

          {visibleRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <FileWarning className="w-8 h-8 text-border mx-auto mb-2" />
              <p className="text-sm text-muted">
                No staff match the current filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border print:border-0">
              <table className="w-full text-xs">
                <thead className="text-left text-[11px] text-muted uppercase tracking-wide bg-surface print:bg-transparent">
                  <tr>
                    <Th>Name</Th>
                    <Th>DOB</Th>
                    <Th>Position</Th>
                    <Th>Employment</Th>
                    <Th>Service</Th>
                    <Th>Phone</Th>
                    <Th>WWCC</Th>
                    <Th>First aid</Th>
                    <Th>CPR</Th>
                    <Th>Anaphylaxis</Th>
                    <Th>Asthma</Th>
                    <Th>Police</Th>
                    <Th>Visa</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr
                      key={r.email}
                      className="border-t border-border align-top"
                      data-testid={`row-${r.email}`}
                    >
                      <Td>
                        <div className="font-medium text-foreground">
                          {r.fullName}
                        </div>
                        <div className="text-muted">{r.email}</div>
                      </Td>
                      <Td>{r.dateOfBirth ?? "—"}</Td>
                      <Td>{r.positionHeld}</Td>
                      <Td>{r.employmentStatus}</Td>
                      <Td>
                        {r.serviceName}
                        {r.serviceCode !== "—" && (
                          <span className="text-muted"> ({r.serviceCode})</span>
                        )}
                      </Td>
                      <Td>{r.phone ?? "—"}</Td>
                      <Td>
                        <ExpiryCell number={r.wwccNumber} expiry={r.wwccExpiry} />
                      </Td>
                      <Td>
                        <ExpiryCell expiry={r.firstAidExpiry} />
                      </Td>
                      <Td>
                        <ExpiryCell expiry={r.cprExpiry} />
                      </Td>
                      <Td>
                        <ExpiryCell expiry={r.anaphylaxisExpiry} />
                      </Td>
                      <Td>
                        <ExpiryCell expiry={r.asthmaExpiry} />
                      </Td>
                      <Td>
                        <ExpiryCell expiry={r.policeCheckExpiry} />
                      </Td>
                      <Td>
                        {r.visaStatus ? (
                          <>
                            <div>{r.visaStatus}</div>
                            {r.visaExpiry && (
                              <div className="text-muted">exp {r.visaExpiry}</div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "supervisor" && (
        <section data-testid="supervisor-register">
          <PlaceholderTab
            title="Nominated supervisor record (Reg 146)"
            description="A formal record of the nominated supervisor for each service, including date of nomination and acceptance of consent. Currently this dashboard tracks coordinators via User.role = 'member' but doesn't capture the formal nomination consent."
            recommendation="Until this register is built, keep nomination consent forms in the documents library tagged 'nominated_supervisor' and surface them here in the next iteration."
            icon={UserCog}
          />
        </section>
      )}

      {tab === "volunteers" && (
        <section data-testid="volunteers-register">
          <PlaceholderTab
            title="Register of volunteers and students (Reg 147)"
            description="Required for any volunteer or student over 18 who participates in education and care while at the service. Captures full name, address, date of birth, dates of attendance, and evidence of WWCC."
            recommendation="If you currently engage volunteers (e.g. parent helpers, work-experience students), keep paper records in a tagged document folder until this register is built."
            icon={HeartHandshake}
          />
        </section>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-2 py-2 align-top whitespace-nowrap text-foreground/90">
      {children}
    </td>
  );
}

// Renders an expiry value with traffic-light colouring based on
// how close it is to today. Pure presentation; the underlying truth
// is the ISO date string.
function ExpiryCell({
  expiry,
  number,
}: {
  expiry: string | null;
  number?: string | null;
}) {
  if (!expiry) {
    if (number) return <span className="text-muted">{number}</span>;
    return <span className="text-red-700 font-medium">Missing</span>;
  }
  const days = Math.ceil(
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const colour =
    days < 0
      ? "text-red-700 font-semibold"
      : days <= 30
        ? "text-amber-700 font-semibold"
        : "text-emerald-700";
  return (
    <div>
      {number && <div className="text-muted">{number}</div>}
      <div className={colour}>{expiry}</div>
    </div>
  );
}

function PlaceholderTab({
  title,
  description,
  recommendation,
  icon: Icon,
}: {
  title: string;
  description: string;
  recommendation: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 max-w-2xl">
      <Icon className="w-8 h-8 text-muted mb-3" />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted mt-2">{description}</p>
      <p className="text-sm text-foreground/80 mt-3">
        <span className="font-medium">In the meantime:</span> {recommendation}
      </p>
    </div>
  );
}
