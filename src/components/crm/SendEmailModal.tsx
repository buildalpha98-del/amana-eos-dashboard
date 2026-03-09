"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useSendLeadEmail } from "@/hooks/useCRM";
import { useCrmEmailTemplates } from "@/hooks/useCrmEmailTemplates";

export function SendEmailModal({
  open,
  onClose,
  leadId,
  contactEmail,
  contactName,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  contactEmail: string;
  contactName: string | null;
}) {
  const sendEmail = useSendLeadEmail();
  const { data: templates } = useCrmEmailTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  if (!open) return null;

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = templates?.find((t) => t.id === templateId);
      if (template) {
        setSubject(template.subject);
        setBody(template.body);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;

    await sendEmail.mutateAsync({
      leadId,
      subject: subject.trim(),
      body: body.trim(),
      templateId: selectedTemplateId || undefined,
    });

    setSelectedTemplateId("");
    setSubject("");
    setBody("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Send Email</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              To: {contactName ? `${contactName} <${contactEmail}>` : contactEmail}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template selection */}
          {templates && templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark"
              >
                <option value="">No template (compose manually)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
              placeholder="Email subject"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body *
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
              placeholder="Compose your email..."
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Available merge tags: {"{{schoolName}}"}, {"{{contactName}}"}, {"{{senderName}}"}, {"{{companyName}}"}
            </p>
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
              disabled={sendEmail.isPending || !subject.trim() || !body.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-dark hover:bg-brand rounded-lg disabled:opacity-50"
            >
              {sendEmail.isPending ? "Sending..." : "Send Email"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
