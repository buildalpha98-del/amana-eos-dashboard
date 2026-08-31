"use client";

/**
 * MyDiversityCard — opt-in self-disclosed diversity profile.
 *
 * Privacy-first design:
 *   - Collapsed by default, with a clear "Opt in" CTA.
 *   - Every field optional; "Prefer not to say" is always available.
 *   - "Withdraw consent" hard-deletes the row.
 *   - The card explains what the data is used for + who sees what.
 *
 * 2026-06-01: introduced as part of the diversity & inclusion register.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

type Gender =
  | "woman"
  | "man"
  | "non_binary"
  | "prefer_to_self_describe"
  | "prefer_not_to_say";

type Indigenous =
  | "none"
  | "aboriginal"
  | "torres_strait_islander"
  | "both"
  | "prefer_not_to_say";

type Disability = "none" | "with_disability" | "prefer_not_to_say";

type Carer =
  | "none"
  | "parent_carer"
  | "family_carer"
  | "both"
  | "prefer_not_to_say";

interface DiversityProfile {
  genderIdentity: Gender | null;
  genderSelfDescribed: string | null;
  culturalIdentity: string | null;
  bornInAustralia: boolean | null;
  yearArrivedInAustralia: number | null;
  languageAtHome: string | null;
  indigenousIdentity: Indigenous | null;
  disabilityStatus: Disability | null;
  disabilityType: string | null;
  carerStatus: Carer | null;
  veteranStatus: boolean | null;
  consentGivenAt: string;
}

const GENDER_LABEL: Record<Gender, string> = {
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  prefer_to_self_describe: "Prefer to self-describe",
  prefer_not_to_say: "Prefer not to say",
};

const INDIGENOUS_LABEL: Record<Indigenous, string> = {
  none: "Neither",
  aboriginal: "Aboriginal",
  torres_strait_islander: "Torres Strait Islander",
  both: "Both Aboriginal and Torres Strait Islander",
  prefer_not_to_say: "Prefer not to say",
};

const DISABILITY_LABEL: Record<Disability, string> = {
  none: "No disability",
  with_disability: "Person with disability",
  prefer_not_to_say: "Prefer not to say",
};

const CARER_LABEL: Record<Carer, string> = {
  none: "No carer responsibilities",
  parent_carer: "Parent carer",
  family_carer: "Family carer (non-parent)",
  both: "Both parent and family carer",
  prefer_not_to_say: "Prefer not to say",
};

export function MyDiversityCard() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<
    { profile: DiversityProfile | null },
    ApiResponseError
  >({
    queryKey: ["my-diversity-profile"],
    queryFn: () => fetchApi("/api/diversity-profile"),
    staleTime: 5 * 60_000,
  });

  const hasProfile = !!data?.profile;
  const profile = data?.profile;

  // Form state — hydrated from existing profile.
  const [genderIdentity, setGenderIdentity] = useState<Gender | "">(
    profile?.genderIdentity ?? "",
  );
  const [genderSelfDescribed, setGenderSelfDescribed] = useState(
    profile?.genderSelfDescribed ?? "",
  );
  const [culturalIdentity, setCulturalIdentity] = useState(
    profile?.culturalIdentity ?? "",
  );
  const [bornInAustralia, setBornInAustralia] = useState<"" | "yes" | "no">(
    profile?.bornInAustralia === true
      ? "yes"
      : profile?.bornInAustralia === false
        ? "no"
        : "",
  );
  const [yearArrivedInAustralia, setYearArrivedInAustralia] = useState(
    profile?.yearArrivedInAustralia?.toString() ?? "",
  );
  const [languageAtHome, setLanguageAtHome] = useState(
    profile?.languageAtHome ?? "",
  );
  const [indigenousIdentity, setIndigenousIdentity] = useState<
    Indigenous | ""
  >(profile?.indigenousIdentity ?? "");
  const [disabilityStatus, setDisabilityStatus] = useState<Disability | "">(
    profile?.disabilityStatus ?? "",
  );
  const [disabilityType, setDisabilityType] = useState(
    profile?.disabilityType ?? "",
  );
  const [carerStatus, setCarerStatus] = useState<Carer | "">(
    profile?.carerStatus ?? "",
  );
  const [veteranStatus, setVeteranStatus] = useState<"" | "yes" | "no">(
    profile?.veteranStatus === true
      ? "yes"
      : profile?.veteranStatus === false
        ? "no"
        : "",
  );

  // Re-hydrate when query data lands.
  const [hydrated, setHydrated] = useState(false);
  if (data && !hydrated) {
    if (profile) {
      setGenderIdentity(profile.genderIdentity ?? "");
      setGenderSelfDescribed(profile.genderSelfDescribed ?? "");
      setCulturalIdentity(profile.culturalIdentity ?? "");
      setBornInAustralia(
        profile.bornInAustralia === true
          ? "yes"
          : profile.bornInAustralia === false
            ? "no"
            : "",
      );
      setYearArrivedInAustralia(
        profile.yearArrivedInAustralia?.toString() ?? "",
      );
      setLanguageAtHome(profile.languageAtHome ?? "");
      setIndigenousIdentity(profile.indigenousIdentity ?? "");
      setDisabilityStatus(profile.disabilityStatus ?? "");
      setDisabilityType(profile.disabilityType ?? "");
      setCarerStatus(profile.carerStatus ?? "");
      setVeteranStatus(
        profile.veteranStatus === true
          ? "yes"
          : profile.veteranStatus === false
            ? "no"
            : "",
      );
    }
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: () =>
      mutateApi("/api/diversity-profile", {
        method: "PUT",
        body: {
          genderIdentity: genderIdentity || null,
          genderSelfDescribed:
            genderIdentity === "prefer_to_self_describe"
              ? genderSelfDescribed.trim() || null
              : null,
          culturalIdentity: culturalIdentity.trim() || null,
          bornInAustralia:
            bornInAustralia === "" ? null : bornInAustralia === "yes",
          yearArrivedInAustralia:
            bornInAustralia === "no" && yearArrivedInAustralia
              ? Number(yearArrivedInAustralia)
              : null,
          languageAtHome: languageAtHome.trim() || null,
          indigenousIdentity: indigenousIdentity || null,
          disabilityStatus: disabilityStatus || null,
          disabilityType:
            disabilityStatus === "with_disability"
              ? disabilityType.trim() || null
              : null,
          carerStatus: carerStatus || null,
          veteranStatus:
            veteranStatus === "" ? null : veteranStatus === "yes",
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-diversity-profile"] });
      toast({ description: "Diversity profile saved." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const withdraw = useMutation({
    mutationFn: () =>
      mutateApi("/api/diversity-profile", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-diversity-profile"] });
      toast({ description: "Consent withdrawn. Data deleted." });
      setHydrated(false);
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleWithdraw = () => {
    if (
      !window.confirm(
        "Withdraw consent and permanently delete your diversity profile? This cannot be undone.",
      )
    )
      return;
    withdraw.mutate();
  };

  if (isLoading) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Heart className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              Diversity & Inclusion
            </h3>
            <p className="text-sm text-muted mt-0.5">
              {hasProfile
                ? "You've shared some diversity information (you can update or withdraw)."
                : "Optional — help us understand our team's diversity."}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-muted flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
          <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/40 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              How this data is used
            </p>
            <p>
              You can leave any field blank, choose &ldquo;Prefer not to
              say,&rdquo; or withdraw consent at any time. Admin sees
              aggregate counts only — individual values are never displayed.
              Categories with fewer than 3 people are suppressed.
            </p>
          </div>

          <Field label="Gender identity">
            <select
              value={genderIdentity}
              onChange={(e) => setGenderIdentity(e.target.value as Gender | "")}
              disabled={save.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">— Not specified —</option>
              {(Object.keys(GENDER_LABEL) as Gender[]).map((k) => (
                <option key={k} value={k}>
                  {GENDER_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          {genderIdentity === "prefer_to_self_describe" && (
            <Field label="Self-described gender">
              <input
                type="text"
                value={genderSelfDescribed}
                onChange={(e) => setGenderSelfDescribed(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          )}

          <Field label="Aboriginal or Torres Strait Islander">
            <select
              value={indigenousIdentity}
              onChange={(e) =>
                setIndigenousIdentity(e.target.value as Indigenous | "")
              }
              disabled={save.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">— Not specified —</option>
              {(Object.keys(INDIGENOUS_LABEL) as Indigenous[]).map((k) => (
                <option key={k} value={k}>
                  {INDIGENOUS_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cultural background (free text)">
              <input
                type="text"
                value={culturalIdentity}
                onChange={(e) => setCulturalIdentity(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                placeholder="e.g. Lebanese-Australian"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Language spoken at home">
              <input
                type="text"
                value={languageAtHome}
                onChange={(e) => setLanguageAtHome(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                placeholder="e.g. Arabic, English"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Born in Australia?">
              <select
                value={bornInAustralia}
                onChange={(e) =>
                  setBornInAustralia(e.target.value as "" | "yes" | "no")
                }
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="">— Not specified —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            {bornInAustralia === "no" && (
              <Field label="Year arrived in Australia">
                <input
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={yearArrivedInAustralia}
                  onChange={(e) => setYearArrivedInAustralia(e.target.value)}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </Field>
            )}
          </div>

          <Field label="Disability status">
            <select
              value={disabilityStatus}
              onChange={(e) =>
                setDisabilityStatus(e.target.value as Disability | "")
              }
              disabled={save.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">— Not specified —</option>
              {(Object.keys(DISABILITY_LABEL) as Disability[]).map((k) => (
                <option key={k} value={k}>
                  {DISABILITY_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          {disabilityStatus === "with_disability" && (
            <Field label="Nature of disability (optional)">
              <input
                type="text"
                value={disabilityType}
                onChange={(e) => setDisabilityType(e.target.value)}
                maxLength={200}
                disabled={save.isPending}
                placeholder="Only share what you're comfortable sharing"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          )}

          <Field label="Carer responsibilities">
            <select
              value={carerStatus}
              onChange={(e) => setCarerStatus(e.target.value as Carer | "")}
              disabled={save.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">— Not specified —</option>
              {(Object.keys(CARER_LABEL) as Carer[]).map((k) => (
                <option key={k} value={k}>
                  {CARER_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Australian Defence Force veteran?">
            <select
              value={veteranStatus}
              onChange={(e) =>
                setVeteranStatus(e.target.value as "" | "yes" | "no")
              }
              disabled={save.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">— Not specified —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>

          {hasProfile && profile?.consentGivenAt && (
            <p className="text-xs text-muted">
              You first consented on{" "}
              {new Date(profile.consentGivenAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {hasProfile ? "Save changes" : "Opt in and save"}
            </button>
            {hasProfile && (
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdraw.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
              >
                {withdraw.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Withdraw consent &amp; delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
