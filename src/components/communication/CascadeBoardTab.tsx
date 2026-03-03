"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  useCascadeMessages,
  usePublishCascade,
  useAcknowledgeCascade,
  useDeleteCascade,
} from "@/hooks/useCommunication";
import { useTeam } from "@/hooks/useTeam";
import { cn } from "@/lib/utils";
import {
  Plus,
  X,
  CheckCircle2,
  Megaphone,
  Trash2,
  CalendarDays,
  Users,
  Loader2,
  MessageSquare,
  ArrowDownCircle,
} from "lucide-react";

// ─── Publish Modal ──────────────────────────────────────────────────────────

function PublishCascadeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const publishCascade = usePublishCascade();
  const [meetingId, setMeetingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data: meetings, isLoading: meetingsLoading } = useQuery<any[]>({
    queryKey: ["meetings-for-cascade"],
    queryFn: async () => {
      const res = await fetch("/api/meetings");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!meetingId) {
      setError("Please select a meeting.");
      return;
    }
    if (!message.trim()) {
      setError("Please enter a message.");
      return;
    }

    publishCascade.mutate(
      { meetingId, message: message.trim() } as any,
      {
        onSuccess: () => {
          setMeetingId("");
          setMessage("");
          setError("");
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  const formatMeetingOption = (meeting: any) => {
    const date = new Date(meeting.date).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${meeting.title} — ${date}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Publish Cascade Message
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Share a key message from a meeting with the whole team
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Meeting
            </label>
            {meetingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading meetings...
              </div>
            ) : (
              <select
                required
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="">Select a meeting...</option>
                {meetings?.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {formatMeetingOption(m)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent resize-none"
              placeholder="Write the cascade message for your team..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={publishCascade.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {publishCascade.isPending ? "Publishing..." : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

function formatPublishedDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMeetingDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatPublishedDate(dateStr);
}

// ─── Cascade Card ───────────────────────────────────────────────────────────

function CascadeCard({
  msg,
  teamCount,
  isAdmin,
}: {
  msg: any;
  teamCount: number;
  isAdmin: boolean;
}) {
  const acknowledgeCascade = useAcknowledgeCascade();
  const deleteCascade = useDeleteCascade();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasAcknowledged = msg.acknowledgments && msg.acknowledgments.length > 0;
  const ackCount = msg._count?.acknowledgments ?? 0;

  const handleAcknowledge = () => {
    acknowledgeCascade.mutate(msg.id);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteCascade.mutate(msg.id, {
      onSettled: () => setConfirmDelete(false),
    });
  };

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot and line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-3 h-3 rounded-full mt-1.5 ring-4 ring-white shrink-0",
            hasAcknowledged ? "bg-emerald-500" : "bg-[#004E64]"
          )}
        />
        <div className="w-0.5 flex-1 bg-gray-200" />
      </div>

      {/* Card content */}
      <div className="flex-1 pb-8">
        <div
          className={cn(
            "rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
            hasAcknowledged ? "border-emerald-200" : "border-gray-200"
          )}
        >
          {/* Header: meeting context + time */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CalendarDays className="w-4 h-4 shrink-0 text-[#004E64]" />
              <span className="font-medium text-[#004E64]">
                {msg.meeting?.title ?? "Meeting"}
              </span>
              {msg.meeting?.date && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>{formatMeetingDate(msg.meeting.date)}</span>
                </>
              )}
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {timeAgo(msg.publishedAt)}
            </span>
          </div>

          {/* Message body */}
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap mb-4">
            {msg.message}
          </p>

          {/* Footer: acknowledgment status + actions */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
            {/* Acknowledgment count */}
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Users className="w-3.5 h-3.5" />
              <span>
                {ackCount} of {teamCount} team member{teamCount !== 1 ? "s" : ""}{" "}
                acknowledged
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Acknowledge / Acknowledged */}
              {hasAcknowledged ? (
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Acknowledged
                </div>
              ) : (
                <button
                  onClick={handleAcknowledge}
                  disabled={acknowledgeCascade.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#004E64] bg-[#004E64]/5 border border-[#004E64]/20 rounded-lg hover:bg-[#004E64]/10 transition-colors disabled:opacity-50"
                >
                  {acknowledgeCascade.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Acknowledge
                </button>
              )}

              {/* Delete (admin/owner) */}
              {isAdmin && (
                <button
                  onClick={handleDelete}
                  disabled={deleteCascade.isPending}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50",
                    confirmDelete
                      ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                      : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                  )}
                  title={confirmDelete ? "Click again to confirm" : "Delete message"}
                >
                  {deleteCascade.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  {confirmDelete && <span>Confirm</span>}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Published at label */}
        <p className="text-[11px] text-gray-400 mt-1.5 ml-1">
          Published {formatPublishedDate(msg.publishedAt)}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CascadeBoardTab() {
  const { data: session } = useSession();
  const { data: messages, isLoading, isError } = useCascadeMessages();
  const { data: team } = useTeam();
  const [showPublishModal, setShowPublishModal] = useState(false);

  const userRole = (session?.user as any)?.role;
  const isAdmin = userRole === "owner" || userRole === "admin";
  const teamCount = team?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#004E64]/10">
            <ArrowDownCircle className="w-5 h-5 text-[#004E64]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Cascade Board
            </h2>
            <p className="text-sm text-gray-500">
              Key messages flowing down from L10 meetings
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowPublishModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Publish Cascade
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm">Loading cascade messages...</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">
            Failed to load cascade messages. Please try again.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && (!messages || messages.length === 0) && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#004E64]/5">
              <Megaphone className="w-7 h-7 text-[#004E64]/40" />
            </div>
          </div>
          <h3 className="text-base font-medium text-gray-600 mb-1">
            No cascade messages yet
          </h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            When L10 meetings are completed, key messages will be published here
            for the whole team to read and acknowledge.
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowPublishModal(true)}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Publish First Message
            </button>
          )}
        </div>
      )}

      {/* Timeline feed */}
      {!isLoading && !isError && messages && messages.length > 0 && (
        <div className="border-l-2 border-[#FECE00] ml-1.5 pl-0">
          {messages.map((msg: any) => (
            <CascadeCard
              key={msg.id}
              msg={msg}
              teamCount={teamCount}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Publish Modal */}
      <PublishCascadeModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
      />
    </div>
  );
}
