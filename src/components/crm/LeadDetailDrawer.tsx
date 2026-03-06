"use client";

import { useState } from "react";
import { useLead, useUpdateLead, useDeleteLead, useCreateTouchpoint, useTouchpoints } from "@/hooks/useCRM";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  X,
  Trash2,
  Mail,
  Phone,
  MessageSquare,
  Calendar,
  MapPin,
  User,
  Send,
  ExternalLink,
  Plus,
  Building2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PipelineStage, TouchpointType } from "@prisma/client";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const stageOptions: { key: PipelineStage; label: string }[] = [
  { key: "new_lead", label: "New Lead" },
  { key: "reviewing", label: "Reviewing" },
  { key: "contact_made", label: "Contact Made" },
  { key: "follow_up_1", label: "Follow-up 1" },
  { key: "follow_up_2", label: "Follow-up 2" },
  { key: "meeting_booked", label: "Meeting Booked" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "submitted", label: "Submitted" },
  { key: "negotiating", label: "Negotiating" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "on_hold", label: "On Hold" },
];

const stageColors: Record<string, string> = {
  new_lead: "bg-indigo-100 text-indigo-700 border-indigo-300",
  reviewing: "bg-purple-100 text-purple-700 border-purple-300",
  contact_made: "bg-blue-100 text-blue-700 border-blue-300",
  follow_up_1: "bg-sky-100 text-sky-700 border-sky-300",
  follow_up_2: "bg-cyan-100 text-cyan-700 border-cyan-300",
  meeting_booked: "bg-teal-100 text-teal-700 border-teal-300",
  proposal_sent: "bg-amber-100 text-amber-700 border-amber-300",
  submitted: "bg-orange-100 text-orange-700 border-orange-300",
  negotiating: "bg-red-100 text-red-700 border-red-300",
  won: "bg-emerald-100 text-emerald-700 border-emerald-300",
  lost: "bg-gray-100 text-gray-600 border-gray-300",
  on_hold: "bg-gray-100 text-gray-500 border-gray-300",
};

const touchpointTypeOptions: { key: string; label: string }[] = [
  { key: "call", label: "Call" },
  { key: "meeting", label: "Meeting" },
  { key: "note", label: "Note" },
  { key: "email_sent", label: "Email Sent" },
];

const touchpointIcons: Record<string, typeof Mail> = {
  email_sent: Mail,
  auto_email: Mail,
  call: Phone,
  meeting: Calendar,
  note: MessageSquare,
  stage_change: ExternalLink,
};

interface UserOption {
  id: string;
  name: string;
}

export function LeadDetailDrawer({
  leadId,
  onClose,
  onSendEmail,
}: {
  leadId: string;
  onClose: () => void;
  onSendEmail: () => void;
}) {
  const { data: lead, isLoading } = useLead(leadId);
  const { data: touchpoints } = useTouchpoints(leadId);
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const createTouchpoint = useCreateTouchpoint();

  const [showDelete, setShowDelete] = useState(false);
  const [showAddTouchpoint, setShowAddTouchpoint] = useState(false);
  const [tpType, setTpType] = useState("note");
  const [tpSubject, setTpSubject] = useState("");
  const [tpBody, setTpBody] = useState("");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleDelete = () => {
    deleteLead.mutate(leadId, {
      onSuccess: () => {
        setShowDelete(false);
        onClose();
      },
    });
  };

  const handleAddTouchpoint = (e: React.FormEvent) => {
    e.preventDefault();
    createTouchpoint.mutate(
      {
        leadId,
        type: tpType,
        subject: tpSubject || undefined,
        body: tpBody || undefined,
      },
      {
        onSuccess: () => {
          setTpType("note");
          setTpSubject("");
          setTpBody("");
          setShowAddTouchpoint(false);
        },
      }
    );
  };

  if (isLoading || !lead) {
    return (
      <>
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 z-50 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  const daysInStage = Math.floor(
    (Date.now() - new Date(lead.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Lead Details</h3>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* School Name */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{lead.schoolName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  lead.source === "tender"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {lead.source}
              </span>
              <span className="text-xs text-gray-400">{daysInStage}d in stage</span>
              {lead.estimatedCapacity && (
                <span className="text-xs text-gray-400">
                  Est. {lead.estimatedCapacity} places
                </span>
              )}
            </div>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Pipeline Stage
            </label>
            <div className="flex gap-1 flex-wrap">
              {stageOptions.map((s) => (
                <button
                  key={s.key}
                  onClick={() => updateLead.mutate({ id: leadId, pipelineStage: s.key })}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded-md border transition-colors",
                    lead.pipelineStage === s.key
                      ? stageColors[s.key] || "bg-gray-100 text-gray-600 border-gray-300"
                      : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Assignee
            </label>
            <select
              value={lead.assignedToId || ""}
              onChange={(e) =>
                updateLead.mutate({ id: leadId, assignedToId: e.target.value || null })
              }
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#003344]"
            >
              <option value="">Unassigned</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Contact Info */}
          <div className="border-t pt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Contact
            </h4>
            <div className="space-y-2">
              {lead.contactName && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{lead.contactName}</span>
                </div>
              )}
              {lead.contactEmail && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a
                    href={`mailto:${lead.contactEmail}`}
                    className="text-[#004E64] hover:underline"
                  >
                    {lead.contactEmail}
                  </a>
                </div>
              )}
              {lead.contactPhone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{lead.contactPhone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          {(lead.address || lead.suburb || lead.state) && (
            <div className="border-t pt-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Location
              </h4>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  {lead.address && <p>{lead.address}</p>}
                  <p>
                    {[lead.suburb, lead.state, lead.postcode].filter(Boolean).join(" ")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tender Info */}
          {lead.source === "tender" && (lead.tenderRef || lead.tenderUrl) && (
            <div className="border-t pt-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Tender
              </h4>
              <div className="space-y-1 text-sm text-gray-600">
                {lead.tenderRef && <p>Ref: {lead.tenderRef}</p>}
                {lead.tenderCloseDate && (
                  <p>
                    Closes:{" "}
                    {new Date(lead.tenderCloseDate).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
                {lead.tenderUrl && (
                  <a
                    href={lead.tenderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#004E64] hover:underline"
                  >
                    View Tender <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Won — linked Service */}
          {lead.service && (
            <div className="border-t pt-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Linked Service
              </h4>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building2 className="w-4 h-4 text-gray-400" />
                <a
                  href={`/services/${lead.service.id}`}
                  className="text-[#004E64] hover:underline font-medium"
                >
                  {lead.service.name} ({lead.service.code})
                </a>
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="border-t pt-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Notes
              </h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t pt-4 flex gap-2">
            <button
              onClick={onSendEmail}
              disabled={!lead.contactEmail}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Send Email
            </button>
          </div>

          {/* Touchpoint Timeline */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Touchpoints ({touchpoints?.length || 0})
              </h4>
              <button
                onClick={() => setShowAddTouchpoint(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#004E64] hover:text-[#003D52] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {showAddTouchpoint && (
              <form
                onSubmit={handleAddTouchpoint}
                className="mb-4 p-3 bg-[#004E64]/5 rounded-lg border border-[#004E64]/20 space-y-2"
              >
                <select
                  value={tpType}
                  onChange={(e) => setTpType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#003344]"
                >
                  {touchpointTypeOptions.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={tpSubject}
                  onChange={(e) => setTpSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#003344]"
                />
                <textarea
                  value={tpBody}
                  onChange={(e) => setTpBody(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#003344]"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createTouchpoint.isPending}
                    className="px-3 py-1.5 text-xs bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] disabled:opacity-50"
                  >
                    {createTouchpoint.isPending ? "Adding..." : "Add Touchpoint"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddTouchpoint(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {touchpoints && touchpoints.length > 0 ? (
              <div className="space-y-3">
                {touchpoints.map((tp) => {
                  const Icon = touchpointIcons[tp.type] || MessageSquare;
                  return (
                    <div key={tp.id} className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700 capitalize">
                            {tp.type.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(tp.sentAt).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {tp.subject && (
                          <p className="text-sm text-gray-700 font-medium mt-0.5">
                            {tp.subject}
                          </p>
                        )}
                        {tp.body && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {tp.body}
                          </p>
                        )}
                        {tp.sentBy && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            by {tp.sentBy.name}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No touchpoints yet</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3 flex justify-between">
          <button
            onClick={() => setShowDelete(true)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <p className="text-[10px] text-gray-400">
            Created{" "}
            {new Date(lead.createdAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        <ConfirmDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Delete Lead"
          description={`Are you sure you want to delete "${lead.schoolName}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          loading={deleteLead.isPending}
        />
      </div>
    </>
  );
}
