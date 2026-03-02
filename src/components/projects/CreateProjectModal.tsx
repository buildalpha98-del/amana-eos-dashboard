"use client";

import { useState } from "react";
import { useCreateProject } from "@/hooks/useProjects";
import { useProjectTemplates } from "@/hooks/useProjectTemplates";
import { useServices } from "@/hooks/useServices";
import { useQuery } from "@tanstack/react-query";
import { X, FileText } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

export function CreateProjectModal({
  open,
  onClose,
  defaultServiceId,
}: {
  open: boolean;
  onClose: () => void;
  defaultServiceId?: string;
}) {
  const createProject = useCreateProject();
  const { data: templates } = useProjectTemplates();
  const { data: services } = useServices();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState(defaultServiceId || "");
  const [templateId, setTemplateId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const selectedTemplate = templates?.find((t) => t.id === templateId);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!ownerId) {
      setError("Please select a project owner");
      return;
    }

    createProject.mutate(
      {
        name: name || selectedTemplate?.name || "New Project",
        description: description || selectedTemplate?.description || undefined,
        serviceId: serviceId || null,
        templateId: templateId || null,
        ownerId,
        startDate: startDate || null,
        targetDate: targetDate || null,
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setServiceId("");
          setTemplateId("");
          setOwnerId("");
          setTargetDate("");
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Create New Project
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Optionally start from a template
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
          {/* Template Selector */}
          {templates && templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Template{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTemplateId(t.id === templateId ? "" : t.id);
                      if (t.id !== templateId) {
                        setName(t.name);
                        setDescription(t.description || "");
                      }
                    }}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                      templateId === t.id
                        ? "border-[#1B4D3E] bg-[#1B4D3E]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <FileText
                      className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                        templateId === t.id ? "text-[#1B4D3E]" : "text-gray-400"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {t.name}
                      </p>
                      {t.description && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {t.tasks.length} tasks
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              placeholder="e.g., Lakemba Centre Opening"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Centre{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="">No linked centre</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Owner
              </label>
              <select
                required
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="">Select owner...</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Date{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              />
            </div>
          </div>

          {/* Template tasks preview */}
          {selectedTemplate && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Template will create {selectedTemplate.tasks.length} to-dos:
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedTemplate.tasks.map((t, i) => (
                  <p key={t.id} className="text-xs text-gray-600">
                    {i + 1}. {t.title}
                    {t.defaultDays && (
                      <span className="text-gray-400">
                        {" "}
                        (due in {t.defaultDays}d)
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}

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
              disabled={createProject.isPending}
              className="flex-1 px-4 py-2 bg-[#1B4D3E] text-white font-medium rounded-lg hover:bg-[#164032] transition-colors disabled:opacity-50"
            >
              {createProject.isPending ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
