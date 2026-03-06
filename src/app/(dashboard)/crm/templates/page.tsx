"use client";

import { useState } from "react";
import {
  useCrmEmailTemplates,
  useCreateCrmEmailTemplate,
  useUpdateCrmEmailTemplate,
  useDeleteCrmEmailTemplate,
} from "@/hooks/useCrmEmailTemplates";
import type { CrmEmailTemplateData } from "@/hooks/useCrmEmailTemplates";
import { CrmEmailTemplateForm } from "@/components/crm/CrmEmailTemplateForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Pencil, Trash2, Mail } from "lucide-react";

const stageLabels: Record<string, string> = {
  new_lead: "New Lead",
  reviewing: "Reviewing",
  contact_made: "Contact Made",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  meeting_booked: "Meeting Booked",
  proposal_sent: "Proposal Sent",
  submitted: "Submitted",
  negotiating: "Negotiating",
};

export default function CrmTemplatesPage() {
  const { data: templates, isLoading } = useCrmEmailTemplates();
  const createTemplate = useCreateCrmEmailTemplate();
  const updateTemplate = useUpdateCrmEmailTemplate();
  const deleteTemplate = useDeleteCrmEmailTemplate();

  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CrmEmailTemplateData | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<CrmEmailTemplateData | null>(null);

  const handleCreate = (data: {
    name: string;
    subject: string;
    body: string;
    triggerStage: string | null;
    pipeline: string | null;
    sortOrder: number;
  }) => {
    createTemplate.mutate(data, {
      onSuccess: () => setShowCreate(false),
    });
  };

  const handleUpdate = (data: {
    name: string;
    subject: string;
    body: string;
    triggerStage: string | null;
    pipeline: string | null;
    sortOrder: number;
  }) => {
    if (!editingTemplate) return;
    updateTemplate.mutate(
      { id: editingTemplate.id, ...data },
      { onSuccess: () => setEditingTemplate(null) }
    );
  };

  const handleDelete = () => {
    if (!deletingTemplate) return;
    deleteTemplate.mutate(deletingTemplate.id, {
      onSuccess: () => setDeletingTemplate(null),
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Templates</h2>
          <p className="text-gray-500 mt-1">
            Manage CRM email templates for automated touchpoints
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <p>
          Templates with a <strong>Trigger Stage</strong> are automatically sent when a lead
          enters that stage. Templates without a trigger stage are available for manual use
          when composing emails to leads.
        </p>
        <p className="mt-1 text-xs text-blue-500">
          Merge tags: {"{{schoolName}}"}, {"{{contactName}}"}, {"{{senderName}}"}, {"{{companyName}}"}
        </p>
      </div>

      {/* Templates Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Trigger Stage
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pipeline</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">
                    {t.subject}
                  </td>
                  <td className="px-4 py-3">
                    {t.triggerStage ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {stageLabels[t.triggerStage] || t.triggerStage}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Manual</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.pipeline ? (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.pipeline === "tender"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {t.pipeline}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Both</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setEditingTemplate(t)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingTemplate(t)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Mail className="w-16 h-16 text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No email templates yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Create templates to automate your lead communication
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CrmEmailTemplateForm
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        isPending={createTemplate.isPending}
        title="Create Email Template"
      />

      {/* Edit Modal */}
      <CrmEmailTemplateForm
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSubmit={handleUpdate}
        isPending={updateTemplate.isPending}
        title="Edit Email Template"
        initialData={
          editingTemplate
            ? {
                name: editingTemplate.name,
                subject: editingTemplate.subject,
                body: editingTemplate.body,
                triggerStage: editingTemplate.triggerStage,
                pipeline: editingTemplate.pipeline,
                sortOrder: editingTemplate.sortOrder,
              }
            : undefined
        }
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deletingTemplate}
        onOpenChange={(open) => !open && setDeletingTemplate(null)}
        title="Delete Template"
        description={`Are you sure you want to delete "${deletingTemplate?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        loading={deleteTemplate.isPending}
      />
    </div>
  );
}
