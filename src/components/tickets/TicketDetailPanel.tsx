"use client";

import { useState, useRef, useEffect } from "react";
import {
  useTicket,
  useUpdateTicket,
  useDeleteTicket,
  useSendMessage,
  useTicketMessages,
} from "@/hooks/useTickets";
import { useResponseTemplates } from "@/hooks/useResponseTemplates";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  X,
  Send,
  Trash2,
  Phone,
  User,
  MessageSquare,
  Sparkles,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  FileText,
  ChevronDown,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { TicketStatus, TicketPriority } from "@prisma/client";
import { AiButton } from "@/components/ui/AiButton";

interface UserOption {
  id: string;
  name: string;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const statusSteps: { key: TicketStatus; label: string; color: string; activeColor: string }[] = [
  { key: "new", label: "New", color: "bg-blue-100 text-blue-700", activeColor: "bg-blue-500 text-white" },
  { key: "open", label: "Open", color: "bg-amber-100 text-amber-700", activeColor: "bg-amber-500 text-white" },
  { key: "pending_parent", label: "Pending", color: "bg-purple-100 text-purple-700", activeColor: "bg-purple-500 text-white" },
  { key: "resolved", label: "Resolved", color: "bg-emerald-100 text-emerald-700", activeColor: "bg-emerald-500 text-white" },
  { key: "closed", label: "Closed", color: "bg-gray-100 text-gray-600", activeColor: "bg-gray-500 text-white" },
];

const priorityOptions: { key: TicketPriority; label: string; color: string }[] = [
  { key: "urgent", label: "Urgent", color: "bg-red-100 text-red-700" },
  { key: "high", label: "High", color: "bg-orange-100 text-orange-700" },
  { key: "normal", label: "Normal", color: "bg-blue-100 text-blue-700" },
  { key: "low", label: "Low", color: "bg-gray-100 text-gray-600" },
];

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function DeliveryIcon({ status }: { status: string }) {
  switch (status) {
    case "read":
      return <CheckCheck className="w-3 h-3 text-blue-500" />;
    case "delivered":
      return <CheckCheck className="w-3 h-3 text-gray-400" />;
    case "sent":
      return <Check className="w-3 h-3 text-gray-400" />;
    case "failed":
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    default:
      return null;
  }
}

export function TicketDetailPanel({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: messages = [] } = useTicketMessages(ticketId);
  const { data: templates = [] } = useResponseTemplates();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const sendMessage = useSendMessage();

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [replyText, setReplyText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "details">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  interface TicketEmail {
    id: string;
    subject: string;
    from: string;
    to: string;
    bodyPreview: string;
    receivedAt: string;
    messageId: string | null;
    linkedBy: string | null;
    createdAt: string;
  }

  const { data: ticketEmails = [] } = useQuery<TicketEmail[]>({
    queryKey: ["ticket-emails", ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/emails`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "details",
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    sendMessage.mutate(
      { ticketId, body: replyText.trim() },
      {
        onSuccess: () => setReplyText(""),
        onError: (err: Error) => alert(err.message),
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const handleDelete = () => {
    deleteTicket.mutate(ticketId, {
      onSuccess: () => {
        setConfirmDelete(false);
        onClose();
      },
    });
  };

  // Check 24h window
  const isWindowOpen = ticket?.lastInboundAt
    ? new Date().getTime() - new Date(ticket.lastInboundAt).getTime() < 24 * 60 * 60 * 1000
    : false;

  if (isLoading || !ticket) {
    return (
      <>
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl border-l border-gray-200 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-brand rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading ticket...</p>
          </div>
        </div>
      </>
    );
  }

  const contactName = ticket.contact.parentName || ticket.contact.name || ticket.contact.phoneNumber;

  // Group messages by date
  const messagesByDate: { date: string; messages: typeof messages }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const msgDate = formatDate(msg.createdAt);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      messagesByDate.push({ date: msgDate, messages: [msg] });
    } else {
      messagesByDate[messagesByDate.length - 1].messages.push(msg);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400">#{ticket.ticketNumber}</span>
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                statusSteps.find(s => s.key === ticket.status)?.color
              )}>
                {statusSteps.find(s => s.key === ticket.status)?.label}
              </span>
            </div>
            <h3 className="text-base font-semibold text-gray-900 truncate mt-0.5">
              {ticket.subject || `Conversation with ${contactName}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-gray-200 px-6 shrink-0">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "chat"
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <MessageSquare className="w-4 h-4 inline mr-1.5" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "details"
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <FileText className="w-4 h-4 inline mr-1.5" />
            Details
          </button>
        </div>

        {activeTab === "chat" ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/50 space-y-1">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-gray-500">No messages yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Messages from WhatsApp will appear here
                  </p>
                </div>
              ) : (
                messagesByDate.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center justify-center my-4">
                      <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-200">
                        {group.date}
                      </span>
                    </div>
                    {group.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex mb-2",
                          msg.direction === "outbound" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm",
                            msg.direction === "outbound"
                              ? "bg-brand text-white rounded-br-md"
                              : "bg-white text-gray-900 border border-gray-200 rounded-bl-md"
                          )}
                        >
                          {msg.direction === "outbound" && msg.senderName && (
                            <p className="text-xs text-white/60 font-medium mb-1">
                              {msg.senderName}
                            </p>
                          )}
                          {msg.direction === "inbound" && (
                            <p className="text-xs text-gray-400 font-medium mb-1">
                              {msg.senderName || contactName}
                            </p>
                          )}
                          <p className={cn(
                            "text-sm whitespace-pre-wrap break-words",
                            msg.direction === "outbound" ? "text-white" : "text-gray-800"
                          )}>
                            {msg.body}
                          </p>
                          <div className={cn(
                            "flex items-center gap-1 mt-1",
                            msg.direction === "outbound" ? "justify-end" : "justify-start"
                          )}>
                            <span className={cn(
                              "text-[10px]",
                              msg.direction === "outbound" ? "text-white/50" : "text-gray-400"
                            )}>
                              {formatTime(msg.createdAt)}
                            </span>
                            {msg.direction === "outbound" && (
                              <DeliveryIcon status={msg.deliveryStatus} />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 24h Window Indicator */}
            {ticket.lastInboundAt && (
              <div className={cn(
                "px-4 py-1.5 text-center text-xs font-medium border-t",
                isWindowOpen
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
              )}>
                {isWindowOpen
                  ? "24-hour messaging window is open"
                  : "24-hour window expired \u2014 only template messages can be sent"}
              </div>
            )}

            {/* Reply Input */}
            <div className="border-t border-gray-200 p-4 bg-white shrink-0">
              {/* Template Picker */}
              {showTemplates && templates.length > 0 && (
                <div className="mb-3 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-sm">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setReplyText(t.body);
                        setShowTemplates(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-900">{t.title}</p>
                      <p className="text-xs text-gray-500 truncate">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                  title="Quick replies"
                >
                  <ChevronDown className={cn("w-5 h-5 transition-transform", showTemplates && "rotate-180")} />
                </button>
                <AiButton
                  templateSlug="tickets/response-drafter"
                  variables={{
                    ticketSubject: ticket?.subject || "",
                    messageHistory: messages?.slice(-5).map((m) => `${m.senderName || "Unknown"}: ${m.body}`).join("\n") || "No messages yet",
                    ticketPriority: ticket?.priority || "medium",
                    serviceName: ticket?.service?.name || "Amana OSHC",
                  }}
                  onResult={(text) => setReplyText(text)}
                  label=""
                  size="sm"
                  section="tickets"
                  className="p-2 text-purple-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition-colors flex-shrink-0 !border-0 !px-2 !py-2"
                />
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isWindowOpen ? "Type a reply..." : "24h window expired"}
                  disabled={!isWindowOpen}
                  rows={1}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sendMessage.isPending || !isWindowOpen}
                  className="p-2.5 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Details Tab */
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Status Stepper */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Status
              </label>
              <div className="flex gap-1">
                {statusSteps.map((step) => (
                  <button
                    key={step.key}
                    onClick={() =>
                      updateTicket.mutate({ id: ticketId, status: step.key })
                    }
                    className={cn(
                      "flex-1 py-2 text-xs font-medium rounded-lg transition-colors",
                      ticket.status === step.key ? step.activeColor : step.color + " hover:opacity-80"
                    )}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Priority
              </label>
              <div className="flex gap-1">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() =>
                      updateTicket.mutate({ id: ticketId, priority: opt.key })
                    }
                    className={cn(
                      "flex-1 py-2 text-xs font-medium rounded-lg transition-colors",
                      ticket.priority === opt.key
                        ? opt.color.replace("100", "500") + " text-white"
                        : opt.color + " hover:opacity-80"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Assigned To
              </label>
              <select
                value={ticket.assignedToId || ""}
                onChange={(e) =>
                  updateTicket.mutate({
                    id: ticketId,
                    assignedToId: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Service / Centre */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Centre
              </label>
              <select
                value={ticket.serviceId || ""}
                onChange={(e) =>
                  updateTicket.mutate({
                    id: ticketId,
                    serviceId: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Not specified</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Contact Info */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Contact Info
              </label>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-900">{contactName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{ticket.contact.phoneNumber}</span>
                </div>
                {ticket.contact.childName && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      Child: {ticket.contact.childName}
                    </span>
                  </div>
                )}
                {ticket.service && (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{ticket.service.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Linked Emails */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Linked Emails
              </label>
              {ticketEmails.length > 0 ? (
                <div className="space-y-2">
                  {ticketEmails.map((email) => (
                    <div key={email.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                      <p className="text-sm font-medium text-gray-900 truncate">{email.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5">From: {email.from}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(email.receivedAt)}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{email.bodyPreview}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No emails linked to this ticket</p>
              )}
            </div>

            {/* Timestamps */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Timeline
              </label>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-900">{formatDate(ticket.createdAt)} {formatTime(ticket.createdAt)}</span>
                </div>
                {ticket.firstResponseAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">First Response</span>
                    <span className="text-gray-900">{formatDate(ticket.firstResponseAt)} {formatTime(ticket.firstResponseAt)}</span>
                  </div>
                )}
                {ticket.resolvedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Resolved</span>
                    <span className="text-emerald-600">{formatDate(ticket.resolvedAt)} {formatTime(ticket.resolvedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Delete */}
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Delete Ticket
              </button>
            </div>

            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Delete Ticket"
              description="Are you sure you want to delete this ticket? This action cannot be undone."
              confirmLabel="Delete"
              variant="danger"
              onConfirm={handleDelete}
              loading={deleteTicket.isPending}
            />
          </div>
        )}
      </div>
    </>
  );
}
