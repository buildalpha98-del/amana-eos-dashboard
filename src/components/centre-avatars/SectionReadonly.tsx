"use client";

import type {
  AssetLibrary,
  ParentAvatar,
  ProgrammeMix,
  SectionKey,
  Snapshot,
} from "@/lib/centre-avatar/sections";

/**
 * Readonly summary views for each Centre Avatar section.
 *
 * Replaces the raw JSON dump with a scannable, on-brand read of the captured
 * content. Keeps the JSON dump as a fallback only for unknown shapes.
 */
export function SectionReadonly({
  sectionKey,
  content,
}: {
  sectionKey: SectionKey;
  content: unknown;
}) {
  if (!content || typeof content !== "object" || Object.keys(content).length === 0) {
    return <Empty sectionKey={sectionKey} />;
  }
  switch (sectionKey) {
    case "snapshot":
      return <SnapshotReadonly value={content as Snapshot} />;
    case "parentAvatar":
      return <ParentAvatarReadonly value={content as ParentAvatar} />;
    case "programmeMix":
      return <ProgrammeMixReadonly value={content as ProgrammeMix} />;
    case "assetLibrary":
      return <AssetLibraryReadonly value={content as AssetLibrary} />;
  }
}

function Empty({ sectionKey }: { sectionKey: SectionKey }) {
  const HINTS: Record<SectionKey, string> = {
    snapshot: "Capture the centre's official name, coordinator, school contacts, and the basic numbers.",
    parentAvatar: "Sketch out who the typical family is, what they want, and what stops them enrolling.",
    programmeMix: "List what's running, what's working, and where the gaps are.",
    assetLibrary: "Photos, videos, testimonials, consent list — and what's missing.",
  };
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/30 px-4 py-3 text-xs text-muted">
      <p className="italic">Empty.</p>
      <p className="mt-1">{HINTS[sectionKey]}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section readonly views
// ---------------------------------------------------------------------------

function SnapshotReadonly({ value }: { value: Snapshot }) {
  return (
    <div className="space-y-4 text-sm">
      {value.centreDetails && hasContent(value.centreDetails) && (
        <SubsectionGrid title="Centre details">
          <Pair k="Official name" v={value.centreDetails.officialName} />
          <Pair k="Short name" v={value.centreDetails.shortName} />
          <Pair k="State" v={value.centreDetails.state} />
          <Pair k="School name" v={value.centreDetails.schoolName} />
          <Pair k="School type" v={value.centreDetails.schoolType} />
          <Pair k="Address" v={value.centreDetails.address} colSpan2 />
        </SubsectionGrid>
      )}

      {value.coordinator && hasContent(value.coordinator) && (
        <SubsectionGrid title="Coordinator">
          <Pair k="Name" v={value.coordinator.name} />
          <Pair k="Email" v={value.coordinator.email} />
          <Pair k="Phone" v={value.coordinator.phone} />
          <Pair k="Started" v={value.coordinator.startedAt} />
          <Pair k="Languages" v={value.coordinator.languages} />
          <Pair k="Certifications" v={value.coordinator.certifications} />
          <Pair k="Strengths" v={value.coordinator.strengths} colSpan2 multiline />
          <Pair k="Support needs" v={value.coordinator.supportNeeds} colSpan2 multiline />
        </SubsectionGrid>
      )}

      {value.schoolContacts && hasContent(value.schoolContacts) && (
        <SubsectionPanel title="School contacts">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(value.schoolContacts ?? {}).map(([role, c]) => {
              if (!c || !hasContent(c)) return null;
              const block = c as { name?: string | null; email?: string | null; phone?: string | null; method?: string | null };
              return (
                <div key={role} className="rounded-md border border-border bg-surface/30 p-2">
                  <p className="text-xs font-semibold capitalize">{role.replace(/([A-Z])/g, " $1")}</p>
                  {block.name && <p className="text-xs">{block.name}</p>}
                  {block.email && <p className="text-xs text-muted">{block.email}</p>}
                  {block.phone && <p className="text-xs text-muted">{block.phone}</p>}
                  {block.method && <p className="text-xs italic text-muted">{block.method}</p>}
                </div>
              );
            })}
          </div>
        </SubsectionPanel>
      )}

      {value.schoolCultureNotes && (
        <SubsectionPanel title="School culture notes">
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{value.schoolCultureNotes}</p>
        </SubsectionPanel>
      )}

      {value.numbers && hasContent(value.numbers) && (
        <SubsectionGrid title="Numbers" cols={3}>
          <Pair k="Total school students" v={fmtNum(value.numbers.totalSchoolStudents)} />
          <Pair k="ASC enrolments" v={fmtNum(value.numbers.ascEnrolments)} />
          <Pair k="Penetration rate" v={fmtPct(value.numbers.penetrationRate)} />
          <Pair k="Waitlist" v={fmtNum(value.numbers.waitlist)} />
          <Pair k="Average attendance" v={fmtNum(value.numbers.averageAttendance)} />
        </SubsectionGrid>
      )}

      {value.parentDrivers && value.parentDrivers.length > 0 && (
        <SubsectionPanel title="Parent drivers">
          <div className="flex flex-wrap gap-1.5">
            {value.parentDrivers.map((d, i) => (
              <span key={i} className="rounded-md bg-brand/10 px-2 py-0.5 text-xs text-brand">
                {d}
              </span>
            ))}
          </div>
        </SubsectionPanel>
      )}

      {value.programmeFocus && (
        <Pair k="Programme focus" v={value.programmeFocus} />
      )}
    </div>
  );
}

function ParentAvatarReadonly({ value }: { value: ParentAvatar }) {
  return (
    <div className="space-y-4 text-sm">
      {value.demographics && hasContent(value.demographics) && (
        <SubsectionGrid title="Demographics">
          <Pair k="Age range" v={value.demographics.ageRange} />
          <Pair k="Income" v={value.demographics.income} />
          <Pair k="Family structure" v={value.demographics.familyStructure} colSpan2 />
          <Pair k="Education" v={value.demographics.education} />
          <Pair k="Languages" v={value.demographics.languages} />
          <Pair k="Occupations" v={value.demographics.occupations} colSpan2 />
        </SubsectionGrid>
      )}
      {value.psychographics && hasContent(value.psychographics) && (
        <SubsectionPanel title="Psychographics">
          <NarrativeBlock label="Primary concern" v={value.psychographics.primaryConcern} />
          <NarrativeBlock label="Primary want" v={value.psychographics.primaryWant} />
          <NarrativeBlock label="Top objections" v={value.psychographics.topObjections} />
          <NarrativeBlock label="Enrol trigger" v={value.psychographics.enrolTrigger} />
          <NarrativeBlock label="Deal breaker" v={value.psychographics.dealBreaker} />
        </SubsectionPanel>
      )}
      {value.decisionMaking && hasContent(value.decisionMaking) && (
        <SubsectionGrid title="Decision making" cols={3}>
          <Pair k="Who decides" v={value.decisionMaking.whoDecides} />
          <Pair k="Influencers" v={value.decisionMaking.influencers} />
          <Pair k="Timeline" v={value.decisionMaking.timeline} />
        </SubsectionGrid>
      )}
      {value.commPreferences && hasContent(value.commPreferences) && (
        <SubsectionGrid title="Communication preferences" cols={4}>
          <Pair k="Channel" v={value.commPreferences.channel} />
          <Pair k="Frequency" v={value.commPreferences.frequency} />
          <Pair k="Tone" v={value.commPreferences.tone} />
          <Pair k="Language" v={value.commPreferences.language} />
        </SubsectionGrid>
      )}
      {value.culturalSensitivities && (
        <SubsectionPanel title="Cultural sensitivities">
          <p className="whitespace-pre-wrap">{value.culturalSensitivities}</p>
        </SubsectionPanel>
      )}
      {value.competition && (
        <SubsectionPanel title="Competition">
          <p className="whitespace-pre-wrap">{value.competition}</p>
        </SubsectionPanel>
      )}
      {value.communityDynamics && (
        <SubsectionPanel title="Community dynamics">
          <p className="whitespace-pre-wrap">{value.communityDynamics}</p>
        </SubsectionPanel>
      )}
    </div>
  );
}

function ProgrammeMixReadonly({ value }: { value: ProgrammeMix }) {
  return (
    <div className="space-y-4 text-sm">
      {value.whatsWorking && (
        <SubsectionPanel title="What's working">
          <p className="whitespace-pre-wrap">{value.whatsWorking}</p>
        </SubsectionPanel>
      )}
      {value.whatsNotWorking && (
        <SubsectionPanel title="What's not working">
          <p className="whitespace-pre-wrap">{value.whatsNotWorking}</p>
        </SubsectionPanel>
      )}
      {value.gaps && (
        <SubsectionPanel title="Gaps">
          <p className="whitespace-pre-wrap">{value.gaps}</p>
        </SubsectionPanel>
      )}
      {value.programmes && value.programmes.length > 0 && (
        <SubsectionPanel title={`Programmes (${value.programmes.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Running</th>
                  <th className="py-1 pr-3 font-medium">Attendance</th>
                  <th className="py-1 pr-3 font-medium">Capacity</th>
                  <th className="py-1 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {value.programmes.map((p, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-medium">{p.name}</td>
                    <td className="py-1.5 pr-3">{p.running ? "Yes" : "No"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmtNum(p.attendance)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmtNum(p.capacity)}</td>
                    <td className="py-1.5 text-foreground/80">{p.status ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubsectionPanel>
      )}
    </div>
  );
}

function AssetLibraryReadonly({ value }: { value: AssetLibrary }) {
  const fields: Array<[string, string | null | undefined]> = [
    ["Photo library", value.photoLibrary],
    ["Video library", value.videoLibrary],
    ["Testimonials", value.testimonials],
    ["Parent consent list", value.parentConsentList],
    ["Staff photos", value.staffPhotos],
    ["Newsletter screenshots", value.newsletterScreenshots],
    ["Activation media", value.activationMedia],
    ["Asset gaps", value.assetGaps],
  ];
  return (
    <div className="space-y-3 text-sm">
      {fields
        .filter(([, v]) => Boolean(v && v.trim()))
        .map(([label, v]) => (
          <SubsectionPanel key={label} title={label}>
            <p className="whitespace-pre-wrap">{v}</p>
          </SubsectionPanel>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components / utilities
// ---------------------------------------------------------------------------

function SubsectionGrid({
  title,
  cols = 2,
  children,
}: {
  title: string;
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const colClass = cols === 4 ? "sm:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </p>
      <div className={`grid grid-cols-1 ${colClass} gap-x-4 gap-y-1`}>{children}</div>
    </div>
  );
}

function SubsectionPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </p>
      <div className="rounded-md border border-border bg-surface/30 p-3">{children}</div>
    </div>
  );
}

function Pair({
  k,
  v,
  colSpan2 = false,
  multiline = false,
}: {
  k: string;
  v: string | number | null | undefined;
  colSpan2?: boolean;
  multiline?: boolean;
}) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className={colSpan2 ? "sm:col-span-2" : ""}>
      <span className="text-xs uppercase tracking-wide text-muted">{k}: </span>
      <span className={`text-sm text-foreground/90 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {v}
      </span>
    </div>
  );
}

function NarrativeBlock({ label, v }: { label: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-xs font-medium text-foreground/70">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{v}</p>
    </div>
  );
}

function hasContent(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  return Object.values(obj as Record<string, unknown>).some(
    (v) => v !== null && v !== undefined && v !== "",
  );
}

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString();
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 100)}%`;
}
