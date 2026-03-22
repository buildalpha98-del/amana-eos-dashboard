"use client";

import type { TicketData } from "@/hooks/useTickets";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  Clock,
  User,
} from "lucide-react";

const priorityConfig = {
  urgent: { label: "Urgent", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", badge: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "High", icon: ArrowUp, color: "text-orange-600", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  normal: { label: "Normal", icon: Minus, color: "text-blue-600", bg: "bg-card", badge: "bg-blue-100 text-blue-700 border-blue-200" },
  low: { label: "Low", icon: ArrowDown, color: "text-muted", bg: "bg-card", badge: "bg-surface text-muted border-border" },
};

const statusConfig = {
  new: { label: "New", color: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-500" },
  open: { label: "Open", color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  pending_parent: { label: "Pending", color: "text-purple-600", bg: "bg-purple-50", dot: "bg-purple-500" },
  resolved: { label: "Resolved", color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  closed: { label: "Closed", color: "text-muted", bg: "bg-surface/50", dot: "bg-gray-400" },
};

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

export function TicketCard({
  ticket,
  onClick,
}: {
  ticket: TicketData;
  onClick: () => void;
}) {
  const p = priorityConfig[ticket.priority];
  const s = statusConfig[ticket.status];
  const PriorityIcon = p.icon;

  const contactName = ticket.contact.parentName || ticket.contact.name || ticket.contact.phoneNumber;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-all hover:shadow-md",
        "border-border bg-card"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 p-1.5 rounded-lg", p.bg)}>
          <PriorityIcon className={cn("w-4 h-4", p.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted">#{ticket.ticketNumber}</span>
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", s.bg, s.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
              {s.label}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground truncate">
            {ticket.subject || `Message from ${contactName}`}
          </h4>
          <p className="text-xs text-muted mt-1 truncate">
            {contactName}
            {ticket.contact.childName && (
              <span className="text-muted"> ({ticket.contact.childName})</span>
            )}
          </p>
          <div className="flex items-center gap-3 mt-2">
            {ticket.assignedTo ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <User className="w-3 h-3" />
                {ticket.assignedTo.name}
              </span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">Unassigned</span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <MessageSquare className="w-3 h-3" />
              {ticket._count.messages}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted ml-auto">
              <Clock className="w-3 h-3" />
              {timeAgo(ticket.updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
