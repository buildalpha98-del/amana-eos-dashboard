"use client";

import { useState } from "react";
import { Loader2, Mail, Megaphone, ToggleLeft, ToggleRight } from "lucide-react";
import { useSequences, useUpdateSequence } from "@/hooks/useSequences";
import type { SequenceData } from "@/hooks/useSequences";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface Props {
  onSelect: (seq: SequenceData) => void;
}

const SECTIONS = [
  {
    type: "parent_nurture",
    label: "Parent Nurture",
    icon: Mail,
    badgeColor: "bg-amber-100 text-amber-700",
  },
  {
    type: "crm_outreach",
    label: "CRM Outreach",
    icon: Megaphone,
    badgeColor: "bg-blue-100 text-blue-700",
  },
] as const;

export function SequenceTemplateList({ onSelect }: Props) {
  const { data, isLoading } = useSequences();
  const updateSequence = useUpdateSequence();
  const [seeding, setSeeding] = useState(false);

  const sequences = data?.sequences ?? [];

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/sequences/seed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed sequences");
      toast({ description: "Default sequences loaded" });
      window.location.reload();
    } catch {
      toast({ description: "Failed to load default sequences" });
    } finally {
      setSeeding(false);
    }
  }

  function handleToggle(seq: SequenceData) {
    updateSequence.mutate({
      id: seq.id,
      isActive: !seq.isActive,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-32 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => {
        const sectionSequences = sequences.filter(
          (s) => s.type === section.type,
        );

        return (
          <div key={section.type} className="space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-2">
              <section.icon className="h-4 w-4 text-foreground/50" />
              <h3 className="text-sm font-semibold text-foreground">
                {section.label}
              </h3>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-foreground/50">
                {sectionSequences.length}
              </span>
            </div>

            {/* Cards grid */}
            {sectionSequences.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionSequences.map((seq) => (
                  <button
                    key={seq.id}
                    onClick={() => onSelect(seq)}
                    className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-surface/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {seq.name}
                        </p>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            section.badgeColor,
                          )}
                        >
                          {(seq.triggerStage ?? "manual").replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* Toggle switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={seq.isActive}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(seq);
                        }}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
                          seq.isActive ? "bg-brand" : "bg-border",
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out",
                            seq.isActive ? "translate-x-5" : "translate-x-0",
                          )}
                        />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs text-foreground/50">
                      <span>{seq.steps?.length ?? 0} steps</span>
                      <span className="h-3 w-px bg-border" />
                      <span>
                        {seq._count?.enrolments ?? 0} active enrolments
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface/30 py-8 text-center">
                <p className="text-sm text-foreground/50">
                  No {section.label.toLowerCase()} sequences yet
                </p>
              </div>
            )}

            {/* Seed button */}
            {sectionSequences.length === 0 && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
              >
                {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
                Load Default Sequences
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
