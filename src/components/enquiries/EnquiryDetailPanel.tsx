"use client";

import { useState, useEffect } from "react";
import {
  X,
  Phone,
  Mail,
  FileText,
  CheckCircle,
  Send,
  ChevronDown,
  Calculator,
  Loader2,
  Check,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { CCSCalculator } from "@/components/shared/CCSCalculator";
import { AiButton } from "@/components/ui/AiButton";
import { SendWelcomeEmailModal } from "./SendWelcomeEmailModal";
import { EmailHistorySection } from "./EmailHistorySection";

interface EnquiryDetailPanelProps {
  enquiryId: string;
  onClose: () => void;
  onUpdated: () => void;
}

interface QuickActionModalState {
  action: string | null;
  title: string;
  content: string;
  channel: string;
}

const STAGE_LABELS: Record<string, string> = {
  new_enquiry: "New Enquiry",
  info_sent: "Info Sent",
  nurturing: "Nurturing",
  form_started: "Form Started",
  enrolled: "Enrolled",
  first_session: "First Session",
  day3: "Day 3 Check-in",
  week2: "Week 2",
  month1: "Month 1",
  retained: "Retained",
  cold: "Cold",
};

export function EnquiryDetailPanel({
  enquiryId,
  onClose,
  onUpdated,
}: EnquiryDetailPanelProps) {
  const [enquiry, setEnquiry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCCS, setShowCCS] = useState(false);
  const [actionModal, setActionModal] = useState<QuickActionModalState>({
    action: null,
    title: "",
    content: "",
    channel: "",
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    channel: "",
    parentDriver: "",
    notes: "",
    children: [{ name: "", age: "" }] as { name: string; age: string }[],
  });
  const [saving, setSaving] = useState(false);
  const [showWelcomeEmail, setShowWelcomeEmail] = useState(false);

  const startEditing = () => {
    if (!enquiry) return;
    const children =
      enquiry.childrenDetails && Array.isArray(enquiry.childrenDetails)
        ? (enquiry.childrenDetails as { name: string; age?: number | null }[]).map((c) => ({
            name: c.name,
            age: c.age != null ? String(c.age) : "",
          }))
        : enquiry.childName
          ? [{ name: enquiry.childName, age: enquiry.childAge ? String(enquiry.childAge) : "" }]
          : [{ name: "", age: "" }];
    setEditForm({
      parentName: enquiry.parentName || "",
      parentEmail: enquiry.parentEmail || "",
      parentPhone: enquiry.parentPhone || "",
      channel: enquiry.channel || "",
      parentDriver: enquiry.parentDriver || "",
      notes: enquiry.notes || "",
      children,
    });
    setEditing(true);
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const validChildren = editForm.children.filter((c) => c.name.trim());
      const childrenDetails = validChildren.length > 0
        ? validChildren.map((c) => ({ name: c.name.trim(), age: c.age ? parseInt(c.age) : null }))
        : null;
      const childName = validChildren.length > 0 ? validChildren.map((c) => c.name.trim()).join(", ") : null;
      const childAge = validChildren.length === 1 && validChildren[0].age ? parseInt(validChildren[0].age) : null;

      await fetch(`/api/enquiries/${enquiryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: editForm.parentName,
          parentEmail: editForm.parentEmail || null,
          parentPhone: editForm.parentPhone || null,
          channel: editForm.channel,
          parentDriver: editForm.parentDriver || null,
          notes: editForm.notes || null,
          childrenDetails,
          childName,
          childAge,
        }),
      });
      const res = await fetch(`/api/enquiries/${enquiryId}`);
      setEnquiry(await res.json());
      onUpdated();
      setEditing(false);
      setToast("Parent details updated");
    } catch (err) {
      console.error("Save failed:", err);
      setToast("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetch(`/api/enquiries/${enquiryId}`)
      .then((r) => r.json())
      .then(setEnquiry)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enquiryId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showActionConfirm = (action: string) => {
    if (!enquiry) return;

    const parentFirst = enquiry.parentName?.split(" ")[0] || "Parent";
    const centreName = enquiry.service?.name || "our centre";
    const childNames = getChildDisplay();

    switch (action) {
      case "send_info":
        setActionModal({
          action: "send_info",
          title: "Send Info Pack",
          channel: "email",
          content: `Hi ${parentFirst},\n\nThank you for your interest in ${centreName}. Please find attached our information pack which includes details about our programs, fees, and CCS subsidy information.\n\n${childNames ? `We look forward to welcoming ${childNames} to our service.` : "We look forward to hearing from you."}\n\nKind regards,\n${centreName} Team`,
        });
        break;
      case "log_call":
        setActionModal({
          action: "log_call",
          title: "Log Phone Call",
          channel: "phone",
          content: "",
        });
        break;
      case "mark_ccs":
        // No modal needed, just confirm
        handleConfirmAction("mark_ccs", "", "");
        return;
      case "form_support":
        setActionModal({
          action: "form_support",
          title: "Start Form Support",
          channel: "whatsapp",
          content: `Hi ${parentFirst}, this is ${centreName}. We wanted to reach out and offer help completing your enrolment forms. Would you like us to walk you through it? We can do it over the phone or WhatsApp — whatever works best for you!`,
        });
        break;
    }
  };

  const handleConfirmAction = async (
    action: string,
    content: string,
    channel: string
  ) => {
    if (!enquiry) return;
    setActionLoading(action);

    let touchpointData: any = null;
    let enquiryUpdate: any = null;

    switch (action) {
      case "send_info":
        touchpointData = {
          type: "first_response",
          channel: channel || "email",
          content: content || "Info pack sent",
        };
        enquiryUpdate = { stage: "info_sent" };
        break;
      case "log_call":
        touchpointData = {
          type: "custom",
          channel: "phone",
          content: content || "Phone call logged",
        };
        break;
      case "mark_ccs":
        enquiryUpdate = { ccsEducated: true };
        break;
      case "form_support":
        touchpointData = {
          type: "form_support",
          channel: channel || "whatsapp",
          content: content || "Form support offered",
        };
        break;
    }

    try {
      if (touchpointData) {
        await fetch(`/api/enquiries/${enquiryId}/touchpoints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(touchpointData),
        });
      }
      if (enquiryUpdate) {
        await fetch(`/api/enquiries/${enquiryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enquiryUpdate),
        });
      }
      // Refetch
      const res = await fetch(`/api/enquiries/${enquiryId}`);
      setEnquiry(await res.json());
      onUpdated();

      // Show success toast
      const messages: Record<string, string> = {
        send_info: "Info pack sent & stage updated",
        log_call: "Phone call logged",
        mark_ccs: "Marked as CCS educated",
        form_support: "Form support touchpoint created",
      };
      setToast(messages[action] || "Action completed");
    } catch (err) {
      console.error("Quick action failed:", err);
      setToast("Action failed — please try again");
    } finally {
      setActionLoading(null);
      setActionModal({ action: null, title: "", content: "", channel: "" });
    }
  };

  const getChildDisplay = () => {
    if (enquiry?.childrenDetails && Array.isArray(enquiry.childrenDetails)) {
      return (enquiry.childrenDetails as { name: string; age?: number | null }[])
        .map((c) => `${c.name}${c.age ? ` (age ${c.age})` : ""}`)
        .join(", ");
    }
    if (enquiry?.childName) {
      return `${enquiry.childName}${enquiry.childAge ? ` (age ${enquiry.childAge})` : ""}`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!enquiry) return null;

  const daysInStage = Math.round(
    (Date.now() - new Date(enquiry.stageChangedAt).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const childDisplay = getChildDisplay();

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
        {/* Toast notification */}
        {toast && (
          <div className="absolute top-4 left-4 right-4 z-10 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2 shadow-sm animate-in fade-in slide-in-from-top-2">
            <Check className="h-4 w-4 flex-shrink-0" />
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {enquiry.parentName}
            </h3>
            <p className="text-sm text-gray-500">
              {STAGE_LABELS[enquiry.stage] || enquiry.stage} &middot;{" "}
              {daysInStage} days
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Contact details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">Contact Details</h4>
              {!editing && (
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand/80 font-medium"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="bg-gray-50 rounded-lg p-3 space-y-3 text-sm">
                {/* Parent Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Parent Name</label>
                  <input
                    type="text"
                    value={editForm.parentName}
                    onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                  />
                </div>
                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.parentEmail}
                    onChange={(e) => setEditForm({ ...editForm, parentEmail: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                    placeholder="parent@email.com"
                  />
                </div>
                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editForm.parentPhone}
                    onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                    placeholder="04xx xxx xxx"
                  />
                </div>
                {/* Children */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Children</label>
                  <div className="space-y-2">
                    {editForm.children.map((child, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={child.name}
                          onChange={(e) => {
                            const updated = [...editForm.children];
                            updated[i] = { ...updated[i], name: e.target.value };
                            setEditForm({ ...editForm, children: updated });
                          }}
                          className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                          placeholder="Child name"
                        />
                        <input
                          type="number"
                          value={child.age}
                          onChange={(e) => {
                            const updated = [...editForm.children];
                            updated[i] = { ...updated[i], age: e.target.value };
                            setEditForm({ ...editForm, children: updated });
                          }}
                          className="w-16 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                          placeholder="Age"
                          min={0}
                          max={18}
                        />
                        {editForm.children.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = editForm.children.filter((_, idx) => idx !== i);
                              setEditForm({ ...editForm, children: updated });
                            }}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, children: [...editForm.children, { name: "", age: "" }] })}
                      className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand/80 font-medium"
                    >
                      <Plus className="h-3 w-3" />
                      Add child
                    </button>
                  </div>
                </div>
                {/* Channel */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Channel</label>
                  <select
                    value={editForm.channel}
                    onChange={(e) => setEditForm({ ...editForm, channel: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                  >
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="walkin">Walk-in</option>
                    <option value="referral">Referral</option>
                    <option value="website">Website</option>
                  </select>
                </div>
                {/* Parent Driver */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Driver</label>
                  <select
                    value={editForm.parentDriver}
                    onChange={(e) => setEditForm({ ...editForm, parentDriver: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                  >
                    <option value="">None</option>
                    <option value="homework">Homework</option>
                    <option value="quran">Quran</option>
                    <option value="enrichment">Enrichment</option>
                    <option value="working_parent">Working Parent</option>
                    <option value="traffic">Traffic</option>
                    <option value="sports">Sports</option>
                  </select>
                </div>
                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-brand focus:border-brand"
                    placeholder="Additional notes..."
                  />
                </div>
                {/* Save / Cancel */}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving || !editForm.parentName.trim()}
                    className="px-3 py-1.5 text-xs text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                {enquiry.parentEmail && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Mail className="h-3.5 w-3.5" /> {enquiry.parentEmail}
                  </p>
                )}
                {enquiry.parentPhone && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Phone className="h-3.5 w-3.5" /> {enquiry.parentPhone}
                  </p>
                )}
                {childDisplay && (
                  <p className="text-gray-600">
                    {(enquiry.childrenDetails as any[])?.length > 1
                      ? "Children"
                      : "Child"}
                    : {childDisplay}
                  </p>
                )}
                <p className="text-gray-600">
                  Centre: {enquiry.service?.name || "Unknown"}
                </p>
                <p className="text-gray-600">Channel: {enquiry.channel}</p>
                {enquiry.parentDriver && (
                  <p className="text-gray-600">
                    Driver: {enquiry.parentDriver.replace("_", " ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Status flags */}
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                enquiry.ccsEducated
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {enquiry.ccsEducated ? "CCS Educated" : "CCS Not Discussed"}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                enquiry.formCompleted
                  ? "bg-green-100 text-green-700"
                  : enquiry.formStarted
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              {enquiry.formCompleted
                ? "Form Complete"
                : enquiry.formStarted
                  ? "Form In Progress"
                  : "Form Not Started"}
            </span>
          </div>

          {/* Quick actions */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => showActionConfirm("send_info")}
                disabled={actionLoading === "send_info"}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50"
              >
                {actionLoading === "send_info" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send Info Pack
              </button>
              <button
                onClick={() => showActionConfirm("log_call")}
                disabled={actionLoading === "log_call"}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-50"
              >
                {actionLoading === "log_call" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Phone className="h-3.5 w-3.5" />
                )}
                Log Phone Call
              </button>
              <button
                onClick={() => showActionConfirm("mark_ccs")}
                disabled={
                  actionLoading === "mark_ccs" || enquiry.ccsEducated
                }
                className="flex items-center gap-2 px-3 py-2 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 disabled:opacity-50"
              >
                {actionLoading === "mark_ccs" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                {enquiry.ccsEducated ? "CCS Done" : "Mark CCS Educated"}
              </button>
              <button
                onClick={() => showActionConfirm("form_support")}
                disabled={actionLoading === "form_support"}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 disabled:opacity-50"
              >
                {actionLoading === "form_support" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                Form Support
              </button>
            </div>
            <button
              onClick={() => setShowWelcomeEmail(true)}
              disabled={!enquiry.parentEmail}
              title={
                !enquiry.parentEmail
                  ? "No email address on this enquiry"
                  : enquiry.lastEmailSentAt
                  ? `Welcome email already sent on ${new Date(enquiry.lastEmailSentAt).toLocaleDateString("en-AU")}`
                  : undefined
              }
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Mail className="h-4 w-4" />
              {enquiry.lastEmailSentAt ? "Resend Welcome Email" : "Send Welcome Email"}
            </button>
          </div>

          {/* Notes */}
          {enquiry.notes && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                {enquiry.notes}
              </p>
            </div>
          )}

          {/* Touchpoints timeline */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Touchpoint Timeline
            </h4>
            {enquiry.touchpoints?.length > 0 ? (
              <div className="space-y-3">
                {enquiry.touchpoints.map((tp: any) => (
                  <div
                    key={tp.id}
                    className="bg-gray-50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">
                        {tp.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(tp.createdAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="capitalize">{tp.channel}</span>
                      <span>&middot;</span>
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          tp.status === "sent"
                            ? "bg-green-100 text-green-700"
                            : tp.status === "pending_review"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tp.status.replace("_", " ")}
                      </span>
                      {tp.generatedByCowork && (
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Cowork
                        </span>
                      )}
                    </div>
                    {tp.content && (
                      <p className="text-gray-600 mt-1 line-clamp-3">
                        {tp.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No touchpoints yet</p>
            )}
          </div>

          {/* Email history */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-gray-900">Emails</h4>
            <EmailHistorySection enquiryId={enquiry.id} parentEmail={enquiry.parentEmail} parentName={enquiry.parentName} />
          </div>

          {/* CCS Calculator (collapsible) */}
          <div className="border-t pt-4">
            <button
              onClick={() => setShowCCS(!showCCS)}
              className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 hover:text-gray-900"
            >
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                CCS Calculator
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showCCS ? "rotate-180" : ""}`}
              />
            </button>
            {showCCS && (
              <div className="mt-4">
                <CCSCalculator compact />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Welcome Email Modal */}
      {showWelcomeEmail && enquiry.parentEmail && (
        <SendWelcomeEmailModal
          open={showWelcomeEmail}
          onClose={() => setShowWelcomeEmail(false)}
          enquiry={{
            id: enquiry.id,
            parentName: enquiry.parentName,
            parentEmail: enquiry.parentEmail,
            service: enquiry.service,
          }}
        />
      )}

      {/* Quick Action Modal */}
      {actionModal.action && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() =>
              setActionModal({
                action: null,
                title: "",
                content: "",
                channel: "",
              })
            }
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-base font-semibold text-gray-900">
                  {actionModal.title}
                </h3>
                <button
                  onClick={() =>
                    setActionModal({
                      action: null,
                      title: "",
                      content: "",
                      channel: "",
                    })
                  }
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {actionModal.action === "log_call" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Call Notes
                    </label>
                    <textarea
                      rows={4}
                      value={actionModal.content}
                      onChange={(e) =>
                        setActionModal({
                          ...actionModal,
                          content: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Summary of the phone call..."
                      autoFocus
                    />
                  </div>
                )}

                {(actionModal.action === "send_info" ||
                  actionModal.action === "form_support") && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Channel
                      </label>
                      <select
                        value={actionModal.channel}
                        onChange={(e) =>
                          setActionModal({
                            ...actionModal,
                            channel: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="phone">Phone</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">
                          Message Content
                        </label>
                        <AiButton
                          templateSlug="enquiries/follow-up-email"
                          variables={{
                            parentName: enquiry.parentName || "Parent",
                            childName: getChildDisplay() || "their child",
                            sessionInterest: enquiry.channel || "general enquiry",
                            serviceName: enquiry.service?.name || "our centre",
                            conversationNotes: enquiry.notes || "No notes recorded",
                            serviceDetails: `Centre: ${enquiry.service?.name || "Amana OSHC"}. Stage: ${enquiry.stage}.`,
                          }}
                          onResult={(text) =>
                            setActionModal({ ...actionModal, content: text })
                          }
                          label="Draft with AI"
                          size="sm"
                          section="enquiries"
                        />
                      </div>
                      <textarea
                        rows={6}
                        value={actionModal.content}
                        onChange={(e) =>
                          setActionModal({
                            ...actionModal,
                            content: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      This message will be logged as a touchpoint. You can edit
                      it before confirming.
                    </p>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 p-4 border-t">
                <button
                  onClick={() =>
                    setActionModal({
                      action: null,
                      title: "",
                      content: "",
                      channel: "",
                    })
                  }
                  className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    handleConfirmAction(
                      actionModal.action!,
                      actionModal.content,
                      actionModal.channel
                    )
                  }
                  disabled={!!actionLoading}
                  className="px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
