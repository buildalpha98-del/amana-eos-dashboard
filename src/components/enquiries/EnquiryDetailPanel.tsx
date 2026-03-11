"use client";

import { useState, useEffect } from "react";
import { X, Phone, Mail, MessageCircle, FileText, CheckCircle, Send, ChevronDown, Calculator } from "lucide-react";
import { CCSCalculator } from "@/components/shared/CCSCalculator";

interface EnquiryDetailPanelProps {
  enquiryId: string;
  onClose: () => void;
  onUpdated: () => void;
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

  useEffect(() => {
    fetch(`/api/enquiries/${enquiryId}`)
      .then((r) => r.json())
      .then(setEnquiry)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enquiryId]);

  const handleQuickAction = async (action: string) => {
    if (!enquiry) return;

    let touchpointData: any = null;
    let enquiryUpdate: any = null;

    switch (action) {
      case "send_info":
        touchpointData = { type: "first_response", channel: "email", content: "Info pack sent" };
        enquiryUpdate = { stage: "info_sent" };
        break;
      case "log_call":
        touchpointData = { type: "custom", channel: "phone", content: "Phone call logged" };
        break;
      case "mark_ccs":
        enquiryUpdate = { ccsEducated: true };
        break;
      case "form_support":
        touchpointData = { type: "form_support", channel: "whatsapp", content: "Form support offered" };
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
    } catch (err) {
      console.error("Quick action failed:", err);
    }
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
      (1000 * 60 * 60 * 24),
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
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
            <h4 className="text-sm font-medium text-gray-700">Contact Details</h4>
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
              {enquiry.childName && (
                <p className="text-gray-600">
                  Child: {enquiry.childName}
                  {enquiry.childAge ? ` (age ${enquiry.childAge})` : ""}
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
                onClick={() => handleQuickAction("send_info")}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100"
              >
                <Send className="h-3.5 w-3.5" /> Send Info Pack
              </button>
              <button
                onClick={() => handleQuickAction("log_call")}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100"
              >
                <Phone className="h-3.5 w-3.5" /> Log Phone Call
              </button>
              <button
                onClick={() => handleQuickAction("mark_ccs")}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Mark CCS Educated
              </button>
              <button
                onClick={() => handleQuickAction("form_support")}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100"
              >
                <FileText className="h-3.5 w-3.5" /> Start Form Support
              </button>
            </div>
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
              <ChevronDown className={`h-4 w-4 transition-transform ${showCCS ? "rotate-180" : ""}`} />
            </button>
            {showCCS && (
              <div className="mt-4">
                <CCSCalculator compact />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
