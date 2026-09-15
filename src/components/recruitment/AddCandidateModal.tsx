"use client";

/**
 * Manual intake for the casual pool.
 *
 * Exists because Indeed has no API we can pull applicants from, and because
 * walk-ins and word-of-mouth are a real source at centre level. Only name is
 * required — a half-filled record beats a sticky note, and the rest can be
 * completed from the detail panel later.
 */

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useCreateCandidate } from "@/hooks/useCandidatePool";
import {
  POOL_SOURCES,
  POOL_SOURCE_LABELS,
  POOL_SESSIONS,
  POOL_SESSION_LABELS,
  POOL_DAYS,
  POOL_DAY_LABELS,
} from "@/lib/recruitment/pool";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const QUALIFICATIONS = [
  { value: "", label: "None" },
  { value: "cert_iii", label: "Certificate III" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelor", label: "Bachelor" },
  { value: "masters", label: "Masters" },
  { value: "other", label: "Other" },
];

export function AddCandidateModal({ onClose }: { onClose: () => void }) {
  const create = useCreateCandidate();
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    suburb: "",
    postcode: "",
    preferredRegion: "",
    source: "walkin",
    qualification: "",
    studying: false,
    previousRole: "",
    previousEmployer: "",
    wwccNumber: "",
    hasFirstAid: false,
    hasTransport: false,
  });
  const [sessions, setSessions] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const chip = (active: boolean) =>
    cn(
      "px-2.5 py-1 rounded-full border text-2xs font-medium",
      active
        ? "bg-brand text-white border-brand"
        : "bg-card text-foreground border-border hover:bg-surface",
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-xl">
        <header className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold text-foreground">
            Add candidate
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form
          className="px-5 py-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                name: f.name.trim(),
                email: f.email.trim() || null,
                phone: f.phone.trim() || null,
                suburb: f.suburb.trim() || null,
                postcode: f.postcode.trim() || null,
                preferredRegion: f.preferredRegion.trim() || null,
                source: f.source,
                qualification: f.qualification || null,
                studying: f.studying,
                previousRole: f.previousRole.trim() || null,
                previousEmployer: f.previousEmployer.trim() || null,
                wwccNumber: f.wwccNumber.trim() || null,
                hasFirstAid: f.hasFirstAid,
                hasTransport: f.hasTransport,
                availableSessions: sessions,
                availableDays: days,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-foreground/80">Full name *</span>
            <input
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Email</span>
              <input
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Mobile</span>
              <input
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Suburb</span>
              <input
                value={f.suburb}
                onChange={(e) => setF({ ...f, suburb: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Postcode</span>
              <input
                value={f.postcode}
                onChange={(e) => setF({ ...f, postcode: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Region</span>
              <input
                value={f.preferredRegion}
                onChange={(e) => setF({ ...f, preferredRegion: e.target.value })}
                placeholder="Eastern Melbourne"
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Source</span>
              <select
                value={f.source}
                onChange={(e) => setF({ ...f, source: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              >
                {POOL_SOURCES.map((s) => (
                  <option key={s} value={s}>{POOL_SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Qualification</span>
              <select
                value={f.qualification}
                onChange={(e) => setF({ ...f, qualification: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              >
                {QUALIFICATIONS.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">WWCC number</span>
              <input
                value={f.wwccNumber}
                onChange={(e) => setF({ ...f, wwccNumber: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Most recent role</span>
              <input
                value={f.previousRole}
                onChange={(e) => setF({ ...f, previousRole: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Previous employer</span>
              <input
                value={f.previousEmployer}
                onChange={(e) => setF({ ...f, previousEmployer: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-foreground/80">Available sessions</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {POOL_SESSIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(sessions, setSessions, s)}
                  className={chip(sessions.includes(s))}
                >
                  {POOL_SESSION_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-foreground/80">Available days</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {POOL_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(days, setDays, d)}
                  className={chip(days.includes(d))}
                >
                  {POOL_DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={f.studying}
                onChange={(e) => setF({ ...f, studying: e.target.checked })}
              />
              Currently studying
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={f.hasFirstAid}
                onChange={(e) => setF({ ...f, hasFirstAid: e.target.checked })}
              />
              First aid
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={f.hasTransport}
                onChange={(e) => setF({ ...f, hasTransport: e.target.checked })}
              />
              Own transport
            </label>
          </div>

          <div className="flex gap-2 pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={!f.name.trim() || create.isPending} className="flex-1">
              {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Add to pool
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
