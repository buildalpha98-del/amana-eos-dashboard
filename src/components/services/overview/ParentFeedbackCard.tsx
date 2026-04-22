"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Smile,
  Loader2,
  Copy,
  ExternalLink,
} from "lucide-react";

const SCORE_EMOJI: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "😊", 5: "😍" };

export function ParentFeedbackCard({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["quick-feedback", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/feedback/quick?serviceId=${serviceId}&weeks=8`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.services?.[0] || null;
    },
  });

  const [copied, setCopied] = useState(false);
  const surveyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/survey/feedback/${serviceId}`
    : `/survey/feedback/${serviceId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted uppercase tracking-wider flex items-center gap-1">
          <Smile className="w-3.5 h-3.5" />
          Parent Feedback
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={copyLink}
            className="text-[10px] text-muted hover:text-foreground/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border hover:border-border"
            title="Copy survey link"
          >
            {copied ? "Copied!" : <><Copy className="w-3 h-3" /> Survey Link</>}
          </button>
          <a
            href={surveyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted hover:text-foreground/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border hover:border-border"
          >
            <ExternalLink className="w-3 h-3" /> Preview
          </a>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-muted/50 animate-spin" />
        </div>
      ) : !data || data.totalResponses === 0 ? (
        <div className="bg-surface/50 rounded-xl p-4 text-center">
          <p className="text-sm text-muted">No feedback received yet.</p>
          <p className="text-xs text-muted mt-1">
            Share the survey link with parents via WhatsApp or email.
          </p>
        </div>
      ) : (
        <div className="bg-surface/50 rounded-xl p-4 space-y-3">
          {/* Summary row */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <span className="text-3xl">
                {SCORE_EMOJI[Math.round(data.overallAverage)] || "😐"}
              </span>
              <p className="text-lg font-bold text-foreground">
                {data.overallAverage}
                <span className="text-xs font-normal text-muted">/5</span>
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground/80">
                {data.totalResponses} responses
              </p>
              <p className="text-xs text-muted">Last 8 weeks</p>
            </div>
          </div>

          {/* Weekly trend (sparkline using bars) */}
          {data.weeklyData?.length > 1 && (
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
                Weekly Trend
              </p>
              <div className="flex items-end gap-1 h-8">
                {data.weeklyData
                  .slice()
                  .reverse()
                  .slice(-8)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .map((w: any, i: number) => {
                    const pct = ((w.averageScore - 1) / 4) * 100;
                    const colors =
                      w.averageScore >= 4
                        ? "bg-emerald-400"
                        : w.averageScore >= 3
                          ? "bg-yellow-400"
                          : "bg-red-400";
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${colors}`}
                        style={{ height: `${Math.max(pct, 10)}%` }}
                        title={`Week of ${w.weekStart}: ${w.averageScore} avg (${w.count} responses)`}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
