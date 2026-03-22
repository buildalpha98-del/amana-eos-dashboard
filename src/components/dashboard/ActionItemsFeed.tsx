"use client";

import Link from "next/link";
import {
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Mountain,
  Clock,
} from "lucide-react";

interface ActionItemsFeedProps {
  overdueTodos: { id: string; title: string; assigneeName: string; dueDate: string }[];
  unassignedTickets: { id: string; ticketNumber: number; subject: string }[];
  idsIssues: { id: string; title: string; priority: string }[];
  overdueRocks: { id: string; title: string; ownerName: string; quarter: string }[];
}

function FeedSection({
  title,
  icon: Icon,
  color,
  bgColor,
  count,
  children,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        <div
          className="w-5 h-5 rounded flex items-center justify-center"
          style={{ backgroundColor: bgColor, color }}
        >
          <Icon className="w-3 h-3" />
        </div>
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          {title}
        </span>
        <span
          className="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none"
          style={{ backgroundColor: bgColor, color }}
        >
          {count}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FeedItem({
  href,
  borderColor,
  children,
}: {
  href: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 hover:bg-surface transition-colors border-l-2 ml-1"
      style={{ borderColor }}
    >
      {children}
    </Link>
  );
}

export function ActionItemsFeed({
  overdueTodos,
  unassignedTickets,
  idsIssues,
  overdueRocks,
}: ActionItemsFeedProps) {
  const totalItems =
    overdueTodos.length +
    unassignedTickets.length +
    idsIssues.length +
    overdueRocks.length;

  return (
    <div className="bg-card rounded-xl border border-border p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Action Items</h3>
        {totalItems > 0 && (
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
            {totalItems} items
          </span>
        )}
      </div>

      {totalItems === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <CheckSquare className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-foreground/80">All clear!</p>
          <p className="text-xs text-muted mt-1">No action items need attention</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[400px] space-y-4 pr-1">
          {/* Overdue Todos */}
          <FeedSection
            title="Overdue To-Dos"
            icon={Clock}
            color="#D97706"
            bgColor="#FEF3C7"
            count={overdueTodos.length}
          >
            {overdueTodos.map((todo) => (
              <FeedItem key={todo.id} href="/todos" borderColor="#F59E0B">
                <p className="text-sm text-foreground truncate">{todo.title}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {todo.assigneeName} &middot; Due{" "}
                  {new Date(todo.dueDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </FeedItem>
            ))}
          </FeedSection>

          {/* Unassigned Tickets */}
          <FeedSection
            title="Unassigned Tickets"
            icon={MessageSquare}
            color="#2563EB"
            bgColor="#DBEAFE"
            count={unassignedTickets.length}
          >
            {unassignedTickets.map((ticket) => (
              <FeedItem key={ticket.id} href="/tickets" borderColor="#3B82F6">
                <p className="text-sm text-foreground truncate">
                  #{ticket.ticketNumber} — {ticket.subject}
                </p>
              </FeedItem>
            ))}
          </FeedSection>

          {/* IDS Issues */}
          <FeedSection
            title="Critical & High Issues"
            icon={AlertTriangle}
            color="#DC2626"
            bgColor="#FEE2E2"
            count={idsIssues.length}
          >
            {idsIssues.map((issue) => (
              <FeedItem key={issue.id} href="/issues" borderColor="#EF4444">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground truncate flex-1">
                    {issue.title}
                  </p>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      issue.priority === "critical"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {issue.priority}
                  </span>
                </div>
              </FeedItem>
            ))}
          </FeedSection>

          {/* Overdue Rocks */}
          <FeedSection
            title="Overdue Rocks"
            icon={Mountain}
            color="#D97706"
            bgColor="#FEF3C7"
            count={overdueRocks.length}
          >
            {overdueRocks.map((rock) => (
              <FeedItem key={rock.id} href="/rocks" borderColor="#F59E0B">
                <p className="text-sm text-foreground truncate">{rock.title}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {rock.ownerName} &middot; {rock.quarter}
                </p>
              </FeedItem>
            ))}
          </FeedSection>
        </div>
      )}
    </div>
  );
}
