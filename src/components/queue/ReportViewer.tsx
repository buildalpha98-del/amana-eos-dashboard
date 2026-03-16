"use client";

import { useState, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  FileDown,
  User,
  Clock,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateReportPdf } from "@/lib/report-pdf";
import type { QueueReport } from "@/hooks/useQueue";
import { AiButton } from "@/components/ui/AiButton";

/* ── Brand colours ────────────────────────────────── */
const SEAT_COLOURS: Record<string, { bg: string; text: string }> = {
  marketing: { bg: "#8B5CF6", text: "#fff" },
  mktg: { bg: "#8B5CF6", text: "#fff" },
  people: { bg: "#3B82F6", text: "#fff" },
  hr: { bg: "#3B82F6", text: "#fff" },
  operations: { bg: "#10B981", text: "#fff" },
  ops: { bg: "#10B981", text: "#fff" },
  finance: { bg: "#F59E0B", text: "#fff" },
  fin: { bg: "#F59E0B", text: "#fff" },
  programming: { bg: "#EC4899", text: "#fff" },
  prog: { bg: "#EC4899", text: "#fff" },
  "parent-experience": { bg: "#06B6D4", text: "#fff" },
  px: { bg: "#06B6D4", text: "#fff" },
  partnerships: { bg: "#6366F1", text: "#fff" },
  part: { bg: "#6366F1", text: "#fff" },
};

/* ── Types ────────────────────────────────────────── */
interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  assignee?: string;
}

interface ReportViewerProps {
  report: QueueReport;
  onClose: () => void;
  onReview?: () => void;
  reviewPending?: boolean;
}

/* ── Helpers ──────────────────────────────────────── */
const STAFF_NAMES = ["jayden", "daniel", "akram", "mirna", "tracie"];

function extractAssignee(text: string): string | undefined {
  const regex = new RegExp(`^(${STAFF_NAMES.join("|")})\\b`, "i");
  const match = text.match(regex);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : undefined;
}

function extractActionItems(
  content: string,
  savedChecklist?: Record<string, boolean> | null
): { items: ActionItem[]; cleanedContent: string } {
  const lines = content.split("\n");
  const items: ActionItem[] = [];
  const cleanedLines: string[] = [];
  let inActionSection = false;

  for (const line of lines) {
    // Detect "Action Items" section header
    if (/^#{1,3}\s*action\s*items/i.test(line)) {
      inActionSection = true;
      continue;
    }

    // Check for checkbox syntax
    const checkboxMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (checkboxMatch) {
      const id = `action-${items.length}`;
      items.push({
        id,
        text: checkboxMatch[2].trim(),
        completed:
          savedChecklist?.[id] ?? checkboxMatch[1].toLowerCase() === "x",
        assignee: extractAssignee(checkboxMatch[2]),
      });
      continue;
    }

    // If in action section, treat bullet items as action items
    if (inActionSection) {
      const bulletMatch = line.match(/^[-*]\s+(.+)/);
      if (bulletMatch) {
        const id = `action-${items.length}`;
        items.push({
          id,
          text: bulletMatch[1].trim(),
          completed: savedChecklist?.[id] ?? false,
          assignee: extractAssignee(bulletMatch[1]),
        });
        continue;
      }
      // Empty line or new heading ends action section
      if (line.trim() === "" || /^#/.test(line)) {
        inActionSection = false;
      }
    }

    cleanedLines.push(line);
  }

  return { items, cleanedContent: cleanedLines.join("\n") };
}

function formatMetricLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatMetricValue(value: unknown): string {
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function seatLabel(seat: string) {
  return seat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ── Alert styles ─────────────────────────────────── */
const alertStyles: Record<string, string> = {
  critical: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800",
};

function AlertIcon({ level }: { level: string }) {
  if (level === "critical" || level === "warning")
    return <AlertTriangle className="h-4 w-4 flex-shrink-0" />;
  if (level === "success")
    return <CheckCircle2 className="h-4 w-4 flex-shrink-0" />;
  return <Info className="h-4 w-4 flex-shrink-0" />;
}

/* ── Component ────────────────────────────────────── */
export function ReportViewer({
  report,
  onClose,
  onReview,
  reviewPending,
}: ReportViewerProps) {
  const [checklistState, setChecklistState] = useState<
    Record<string, boolean>
  >((report as unknown as { checklist?: Record<string, boolean> }).checklist || {});
  const [aiSummary, setAiSummary] = useState("");

  const { items: actionItems, cleanedContent } = useMemo(
    () => extractActionItems(report.content, checklistState),
    [report.content, checklistState]
  );

  const alerts = report.alerts as
    | Array<{ level: string; message: string }>
    | null;
  const metrics = report.metrics as Record<string, unknown> | null;
  const seatColour = SEAT_COLOURS[report.seat] || { bg: "#6B7280", text: "#fff" };

  const toggleActionItem = useCallback(
    async (itemId: string, completed: boolean) => {
      setChecklistState((prev) => ({ ...prev, [itemId]: completed }));
      try {
        await fetch(
          `/api/cowork/reports/automation/${report.id}/checklist`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, completed }),
          }
        );
      } catch {
        // Revert on error
        setChecklistState((prev) => ({ ...prev, [itemId]: !completed }));
      }
    },
    [report.id]
  );

  const handleExportPdf = useCallback(() => {
    const doc = generateReportPdf({
      title: report.title,
      seat: report.seat,
      reportType: report.reportType,
      content: report.content,
      metrics,
      alerts,
      actionItems,
      centreName: report.service?.name,
      assigneeName: report.assignedTo?.name,
      createdAt: report.createdAt,
    });
    doc.save(
      `AMANA_${report.seat.toUpperCase()}_${report.reportType}_${new Date().toISOString().slice(0, 10)}.pdf`
    );
  }, [report, metrics, alerts, actionItems]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-[#FFFAE6]">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: seatColour.bg, color: seatColour.text }}
            >
              {seatLabel(report.seat)}
            </span>
            <span className="text-xs text-gray-500 capitalize">
              {report.reportType.replace(/-/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AiButton
              templateSlug="queue/report-summary"
              variables={{
                reportTitle: report.title,
                reportType: report.reportType,
                seat: report.seat,
                content: report.content.slice(0, 2000),
                centreName: report.service?.name || "all centres",
              }}
              onResult={(text) => setAiSummary(text)}
              label="Summarise"
              size="sm"
              section="queue"
            />
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          </div>
        </div>

        {/* AI Summary */}
        {aiSummary && (
          <div className="mx-6 mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 text-sm text-purple-900 whitespace-pre-wrap">{aiSummary}</div>
              <button onClick={() => setAiSummary("")} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Header section */}
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-xl font-bold text-[#004E64] leading-tight">
              {report.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
              {report.service && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {report.service.name}
                </span>
              )}
              {report.assignedTo && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {report.assignedTo.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {new Date(report.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 font-medium",
                  report.status === "pending"
                    ? "text-amber-600"
                    : "text-green-600"
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    report.status === "pending"
                      ? "bg-amber-500"
                      : "bg-green-500"
                  )}
                />
                {report.status.charAt(0).toUpperCase() +
                  report.status.slice(1)}
              </span>
            </div>
          </div>

          {/* ── Alerts ── */}
          {alerts && alerts.length > 0 && (
            <div className="px-6 pb-4 space-y-2">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm",
                    alertStyles[alert.level] || alertStyles.info
                  )}
                >
                  <AlertIcon level={alert.level} />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Metrics ── */}
          {metrics && Object.keys(metrics).length > 0 && (
            <div className="px-6 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(metrics).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-[#FFF2BF] bg-[#FFFAE6] p-3 text-center"
                  >
                    <div className="text-lg font-bold text-[#004E64]">
                      {formatMetricValue(value)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatMetricLabel(key)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Action Items ── */}
          {actionItems.length > 0 && (
            <div className="px-6 pb-4">
              <h2 className="text-sm font-semibold text-[#004E64] uppercase tracking-wider mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Action Items ({actionItems.filter((i) => i.completed).length}/
                {actionItems.length})
              </h2>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {actionItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 py-2.5 px-3.5 hover:bg-[#FFF2BF]/30 transition-colors"
                  >
                    <button
                      onClick={() =>
                        toggleActionItem(item.id, !item.completed)
                      }
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors",
                        item.completed
                          ? "bg-[#004E64] border-[#004E64]"
                          : "border-gray-300 hover:border-[#004E64]"
                      )}
                    >
                      {item.completed && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "text-sm",
                          item.completed && "line-through text-gray-400"
                        )}
                      >
                        {item.text}
                      </span>
                      {item.assignee && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#FFF2BF] text-[#004E64] font-medium">
                          {item.assignee}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Report Content (Markdown) ── */}
          <div className="px-6 pb-6">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-xl font-bold text-[#004E64] mt-6 mb-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-semibold text-[#004E64] mt-5 mb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-[#004E64] mt-4 mb-1">
                      {children}
                    </h3>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[#004E64]">
                      {children}
                    </strong>
                  ),
                  li: ({ children }) => (
                    <li className="text-sm text-gray-700 ml-4">{children}</li>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      className="text-[#004E64] underline hover:text-[#FECE00]"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-gray-700 mb-2">{children}</p>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 space-y-1 mb-3 text-sm text-gray-700">
                      {children}
                    </ol>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 space-y-1 mb-3 text-sm text-gray-700">
                      {children}
                    </ul>
                  ),
                }}
              >
                {cleanedContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* ── Actions Bar ── */}
        <div className="border-t border-gray-200 bg-white px-6 py-4 flex items-center gap-3">
          {report.status === "pending" && onReview && (
            <button
              onClick={onReview}
              disabled={reviewPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003d50] transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {reviewPending ? "Marking..." : "Mark Reviewed"}
            </button>
          )}
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#004E64] bg-[#FFF2BF] rounded-lg hover:bg-[#FECE00] transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Export PDF
          </button>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">
            {report.id.slice(0, 8)}
          </span>
        </div>
      </div>
    </div>
  );
}
