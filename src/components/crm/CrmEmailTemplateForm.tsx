"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const stageOptions = [
  { key: "", label: "No trigger (manual only)" },
  { key: "new_lead", label: "New Lead" },
  { key: "reviewing", label: "Reviewing" },
  { key: "contact_made", label: "Contact Made" },
  { key: "follow_up_1", label: "Follow-up 1" },
  { key: "follow_up_2", label: "Follow-up 2" },
  { key: "meeting_booked", label: "Meeting Booked" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "submitted", label: "Submitted" },
  { key: "negotiating", label: "Negotiating" },
];

const pipelineOptions = [
  { key: "", label: "Both pipelines" },
  { key: "direct", label: "Direct" },
  { key: "tender", label: "Tender" },
];

interface TemplateFormData {
  name: string;
  subject: string;
  body: string;
  triggerStage: string | null;
  pipeline: string | null;
  sortOrder: number;
}

interface CrmEmailTemplateFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: TemplateFormData) => void;
  isPending: boolean;
  initialData?: {
    name: string;
    subject: string;
    body: string;
    triggerStage: string | null;
    pipeline: string | null;
    sortOrder: number;
  };
  title: string;
}

export function CrmEmailTemplateForm({
  open,
  onClose,
  onSubmit,
  isPending,
  initialData,
  title,
}: CrmEmailTemplateFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [triggerStage, setTriggerStage] = useState(initialData?.triggerStage || "");
  const [pipeline, setPipeline] = useState(initialData?.pipeline || "");
  const [sortOrder, setSortOrder] = useState(initialData?.sortOrder ?? 0);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setSubject(initialData.subject);
      setBody(initialData.body);
      setTriggerStage(initialData.triggerStage || "");
      setPipeline(initialData.pipeline || "");
      setSortOrder(initialData.sortOrder);
    } else {
      setName("");
      setSubject("");
      setBody("");
      setTriggerStage("");
      setPipeline("");
      setSortOrder(0);
    }
  }, [initialData, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !body.trim()) return;

    onSubmit({
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      triggerStage: triggerStage || null,
      pipeline: pipeline || null,
      sortOrder,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
              placeholder="e.g. Initial Contact Email"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trigger Stage
              </label>
              <select
                value={triggerStage}
                onChange={(e) => setTriggerStage(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
              >
                {stageOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pipeline
              </label>
              <select
                value={pipeline}
                onChange={(e) => setPipeline(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
              >
                {pipelineOptions.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Subject *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
              placeholder="e.g. Introduction to Amana OSHC — {{schoolName}}"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Body *
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent font-mono"
              placeholder="Write your email template here..."
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Merge tags: {"{{schoolName}}"}, {"{{contactName}}"}, {"{{senderName}}"}, {"{{companyName}}"}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort Order
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim() || !subject.trim() || !body.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-dark hover:bg-brand rounded-lg disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
