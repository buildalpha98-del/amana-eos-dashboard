"use client";

/**
 * DailyReflectionCard — quick-entry card for the staff daily reflection.
 *
 * One entry fans out server-side: tagged children get portfolio observations,
 * and "Share with parents" publishes a ParentPost to the family feed. AI can
 * suggest NQS quality-area + MTOP outcome tags; the educator confirms chips
 * before saving (confirmed tags are human-provenance, aiTagged=false).
 */

import { useState } from "react";
import { Sparkles, Send, Loader2, Users, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import { useChildren } from "@/hooks/useChildren";
import { useCreateReflection } from "@/hooks/useReflections";
import { useAiGenerate } from "@/hooks/useAiGenerate";
import { MTOP_OUTCOMES } from "@/lib/schemas/staff-reflection";

const QA_CHIPS: readonly { value: number; label: string }[] = [
  { value: 1, label: "QA1 Program" },
  { value: 2, label: "QA2 Health & safety" },
  { value: 3, label: "QA3 Environment" },
  { value: 4, label: "QA4 Staffing" },
  { value: 5, label: "QA5 Relationships" },
  { value: 6, label: "QA6 Partnerships" },
  { value: 7, label: "QA7 Governance" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors min-h-[28px]",
        active
          ? "bg-[color:var(--color-primary,#004E64)] text-white border-transparent"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
      )}
    >
      {children}
    </button>
  );
}

export function DailyReflectionCard({ serviceId }: { serviceId: string }) {
  const [content, setContent] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const [shareWithParents, setShareWithParents] = useState(false);
  const [qualityAreas, setQualityAreas] = useState<number[]>([]);
  const [mtopOutcomes, setMtopOutcomes] = useState<string[]>([]);
  const [showChildren, setShowChildren] = useState(false);

  const { data: childrenData } = useChildren({ serviceId, status: "active" });
  const children = childrenData?.children ?? [];

  const createReflection = useCreateReflection(serviceId);
  const { generate, isLoading: aiLoading } = useAiGenerate();

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  async function suggestTags() {
    if (!content.trim()) {
      toast({ description: "Write your reflection first, then I can suggest tags." });
      return;
    }
    const text = await generate({
      templateSlug: "nqs/tag-content",
      variables: { items: `1. ${content.trim()}` },
      section: "daily-reflection",
    });
    if (!text) return; // hook already toasted
    try {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      const parsed = JSON.parse(cleaned) as {
        items?: { qualityAreas?: number[]; mtopOutcomes?: string[] }[];
      };
      const first = parsed.items?.[0];
      if (!first) throw new Error("empty");
      setQualityAreas((first.qualityAreas ?? []).filter((q) => q >= 1 && q <= 7));
      setMtopOutcomes(
        (first.mtopOutcomes ?? []).filter((m) =>
          (MTOP_OUTCOMES as readonly string[]).includes(m),
        ),
      );
    } catch {
      toast({
        variant: "destructive",
        description: "Couldn't suggest tags — pick them manually.",
      });
    }
  }

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed) return;
    const today = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "Australia/Sydney",
    });
    try {
      await createReflection.mutateAsync({
        type: "daily",
        title: `Daily reflection — ${today}`,
        content: trimmed,
        qualityAreas,
        mtopOutcomes,
        childIds,
        shareWithParents,
        clientMutationId: crypto.randomUUID(),
      });
      const bits = ["Daily reflection saved"];
      if (childIds.length > 0)
        bits.push(`${childIds.length} portfolio observation${childIds.length === 1 ? "" : "s"} created`);
      if (shareWithParents) bits.push("shared with families");
      toast({ description: bits.join(" · ") });
      setContent("");
      setChildIds([]);
      setShareWithParents(false);
      setQualityAreas([]);
      setMtopOutcomes([]);
    } catch {
      // useCreateReflection.onError already shows the destructive toast
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Today&apos;s reflection</h3>
        <span className="text-[11px] text-gray-400">
          feeds families + the SAT/QIP evidence trail
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={20_000}
        placeholder="How did today go? What did the children engage with?"
        className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary,#004E64)]/30 resize-y"
      />

      {/* Children involved */}
      <div>
        <button
          type="button"
          onClick={() => setShowChildren((s) => !s)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <Users className="w-3.5 h-3.5" />
          Children involved{childIds.length > 0 ? ` (${childIds.length})` : ""}
          {showChildren ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
        {showChildren && (
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {children.length === 0 ? (
              <p className="text-xs text-gray-400">No enrolled children found</p>
            ) : (
              children.map((child: { id: string; firstName: string; surname?: string | null }) => (
                <Chip
                  key={child.id}
                  active={childIds.includes(child.id)}
                  onClick={() => setChildIds((ids) => toggle(ids, child.id))}
                >
                  {child.firstName} {child.surname?.[0] ?? ""}
                </Chip>
              ))
            )}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {QA_CHIPS.map((qa) => (
            <Chip
              key={qa.value}
              active={qualityAreas.includes(qa.value)}
              onClick={() => setQualityAreas((list) => toggle(list, qa.value))}
            >
              {qa.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MTOP_OUTCOMES.map((outcome) => (
            <Chip
              key={outcome}
              active={mtopOutcomes.includes(outcome)}
              onClick={() => setMtopOutcomes((list) => toggle(list, outcome))}
            >
              {outcome}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between pt-1">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={shareWithParents}
            onChange={(e) => setShareWithParents(e.target.checked)}
            className="rounded border-gray-300 text-[color:var(--color-primary,#004E64)]"
          />
          Share with parents
          {shareWithParents && childIds.length === 0 && (
            <span className="text-[11px] text-amber-600">(community post — no children tagged)</span>
          )}
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={suggestTags}
            disabled={aiLoading || !content.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 min-h-[36px]"
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Suggest tags
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={createReflection.isPending || !content.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[color:var(--color-primary,#004E64)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 min-h-[36px]"
          >
            {createReflection.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Save today&apos;s reflection
          </button>
        </div>
      </div>
    </div>
  );
}
