"use client";

import { Mail, RefreshCw, Loader2 } from "lucide-react";
import {
  useEmailHistory,
  useSendEmail,
} from "@/hooks/useEmailTemplates";

interface Props {
  enquiryId: string;
  parentEmail?: string | null;
  parentName?: string;
}

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  scheduled: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export function EmailHistorySection({
  enquiryId,
  parentEmail,
  parentName,
}: Props) {
  const { data: history, isLoading } = useEmailHistory(
    "ParentEnquiry",
    enquiryId,
  );
  const sendMutation = useSendEmail();

  const handleResend = (entry: { subject: string | null }) => {
    if (!parentEmail) return;
    sendMutation.mutate({
      subject: entry.subject || "Welcome to Amana OSHC",
      enquiryId,
      htmlContent: null,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg bg-gray-100 h-14"
          />
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-gray-400">No emails sent yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">
                {entry.subject || "No subject"}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>
                  {new Date(entry.createdAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    STATUS_STYLES[entry.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {entry.status}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleResend(entry)}
            disabled={sendMutation.isPending || !parentEmail}
            title="Resend this email"
            className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-brand hover:bg-brand/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
