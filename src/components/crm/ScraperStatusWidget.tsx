"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface ScrapeRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  leadsFound: number;
  leadsCreated: number;
  error: string | null;
}

export function ScraperStatusWidget() {
  const { data: scrapeRun } = useQuery<ScrapeRun | null>({
    queryKey: ["scraper-status"],
    queryFn: async () => {
      const res = await fetch("/api/crm/scraper-status");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (!scrapeRun) return null;

  const statusIcon = {
    running: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
    completed: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  }[scrapeRun.status] || <Clock className="w-3.5 h-3.5 text-muted" />;

  const statusColor = {
    running: "bg-blue-50 border-blue-200",
    completed: "bg-emerald-50 border-emerald-200",
    failed: "bg-red-50 border-red-200",
  }[scrapeRun.status] || "bg-surface/50 border-border";

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "< 1h ago";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${statusColor}`}>
      {statusIcon}
      <span className="text-muted">
        Tender scraper: {scrapeRun.status}
      </span>
      {scrapeRun.status === "completed" && (
        <span className="text-muted">
          {scrapeRun.leadsCreated > 0
            ? `${scrapeRun.leadsCreated} new lead${scrapeRun.leadsCreated !== 1 ? "s" : ""}`
            : "no new leads"}
        </span>
      )}
      <span className="text-muted">
        {timeAgo(scrapeRun.completedAt || scrapeRun.startedAt)}
      </span>
    </div>
  );
}
