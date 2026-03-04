"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  FileText,
  Play,
  HelpCircle,
  CheckSquare,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LMSModuleData } from "@/hooks/useLMS";
import { useCreateModule, useUpdateModule, useDeleteModule, useReorderModules } from "@/hooks/useLMS";

const typeConfig = {
  document: { label: "Document", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  video: { label: "Video", icon: Play, color: "text-purple-600", bg: "bg-purple-50" },
  quiz: { label: "Quiz", icon: HelpCircle, color: "text-amber-600", bg: "bg-amber-50" },
  checklist: { label: "Checklist", icon: CheckSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
  external_link: { label: "External Link", icon: ExternalLink, color: "text-gray-600", bg: "bg-gray-50" },
};

interface ModuleEditorProps {
  courseId: string;
  modules: LMSModuleData[];
}

function SortableModuleCard({
  module,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}: {
  module: LMSModuleData;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  onSaveEdit: (data: Partial<LMSModuleData>) => void;
  onCancelEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ModuleCard
        module={module}
        onEdit={onEdit}
        onDelete={onDelete}
        isDragging={isDragging}
        dragListeners={listeners}
        isEditing={isEditing}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
      />
    </div>
  );
}

function ModuleCard({
  module,
  onEdit,
  onDelete,
  isDragging,
  dragListeners,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}: {
  module: LMSModuleData;
  onEdit: () => void;
  onDelete: () => void;
  isDragging?: boolean;
  dragListeners?: Record<string, unknown>;
  isEditing: boolean;
  onSaveEdit: (data: Partial<LMSModuleData>) => void;
  onCancelEdit: () => void;
}) {
  const config = typeConfig[module.type as keyof typeof typeConfig] || typeConfig.document;
  const Icon = config.icon;

  const [editTitle, setEditTitle] = useState(module.title);
  const [editType, setEditType] = useState(module.type);
  const [editContent, setEditContent] = useState(module.content || "");
  const [editUrl, setEditUrl] = useState(module.resourceUrl || "");
  const [editDuration, setEditDuration] = useState(module.duration?.toString() || "");
  const [editRequired, setEditRequired] = useState(module.isRequired);
  const [confirmDel, setConfirmDel] = useState(false);

  if (isEditing) {
    return (
      <div className="bg-white border border-[#004E64]/30 rounded-lg p-4 space-y-3">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64]"
          placeholder="Module title"
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            value={editType}
            onChange={(e) => setEditType(e.target.value as LMSModuleData["type"])}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
          >
            {Object.entries(typeConfig).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <input
            type="number"
            value={editDuration}
            onChange={(e) => setEditDuration(e.target.value)}
            placeholder="Duration (min)"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
          />
        </div>
        {(editType === "document" || editType === "checklist" || editType === "quiz") && (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            placeholder="Content / instructions..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
          />
        )}
        {(editType === "video" || editType === "external_link") && (
          <input
            type="url"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            placeholder="URL..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
          />
        )}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={editRequired}
              onChange={(e) => setEditRequired(e.target.checked)}
              className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
            />
            Required
          </label>
          <div className="flex gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                onSaveEdit({
                  title: editTitle,
                  type: editType as LMSModuleData["type"],
                  content: editContent || null,
                  resourceUrl: editUrl || null,
                  duration: editDuration ? parseInt(editDuration) : null,
                  isRequired: editRequired,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[#004E64] text-white rounded-lg hover:bg-[#003D52]"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 group hover:shadow-sm transition-all",
        isDragging && "shadow-lg rotate-1 opacity-90"
      )}
    >
      <div {...dragListeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>

      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.bg)}>
        <Icon className={cn("w-4 h-4", config.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{module.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", config.bg, config.color)}>
            {config.label}
          </span>
          {module.duration && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {module.duration}min
            </span>
          )}
          {module.isRequired && (
            <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
              <ShieldCheck className="w-2.5 h-2.5" />
              Required
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-[#004E64] rounded-md hover:bg-gray-100">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {confirmDel ? (
          <div className="flex items-center gap-1">
            <button onClick={onDelete} className="px-2 py-1 text-[10px] font-medium text-white bg-red-600 rounded hover:bg-red-700">
              Delete
            </button>
            <button onClick={() => setConfirmDel(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDel(true)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ModuleEditor({ courseId, modules }: ModuleEditorProps) {
  const [activeModule, setActiveModule] = useState<LMSModuleData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("document");
  const [newContent, setNewContent] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newRequired, setNewRequired] = useState(true);

  const createModule = useCreateModule();
  const updateModule = useUpdateModule();
  const deleteModule = useDeleteModule();
  const reorderModules = useReorderModules();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const mod = modules.find((m) => m.id === event.active.id);
    if (mod) setActiveModule(mod);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveModule(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(modules, oldIndex, newIndex);
    reorderModules.mutate({
      courseId,
      moduleIds: reordered.map((m) => m.id),
    });
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createModule.mutate(
      {
        courseId,
        title: newTitle.trim(),
        type: newType,
        content: newContent || undefined,
        resourceUrl: newUrl || undefined,
        duration: newDuration ? parseInt(newDuration) : undefined,
        isRequired: newRequired,
      },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewType("document");
          setNewContent("");
          setNewUrl("");
          setNewDuration("");
          setNewRequired(true);
          setShowAdd(false);
        },
      }
    );
  };

  const handleSaveEdit = (moduleId: string, data: Partial<LMSModuleData>) => {
    updateModule.mutate({ moduleId, ...data } as Parameters<typeof updateModule.mutate>[0], {
      onSuccess: () => setEditingId(null),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Modules ({modules.length})
        </h4>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs text-[#004E64] hover:text-[#003D52] font-medium flex items-center gap-0.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Module
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={modules.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {modules.map((mod) => (
              <SortableModuleCard
                key={mod.id}
                module={mod}
                isEditing={editingId === mod.id}
                onEdit={() => setEditingId(mod.id)}
                onDelete={() => deleteModule.mutate(mod.id)}
                onSaveEdit={(data) => handleSaveEdit(mod.id, data)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeModule && (
            <div className="w-full">
              <ModuleCard
                module={activeModule}
                isDragging
                onEdit={() => {}}
                onDelete={() => {}}
                isEditing={false}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {modules.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-6 italic">
          No modules yet — add modules to build this course
        </p>
      )}

      {/* Add Module Form */}
      {showAdd && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Module title..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
            >
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <input
              type="number"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              placeholder="Duration (min)"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
            />
          </div>
          {(newType === "document" || newType === "checklist" || newType === "quiz") && (
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              placeholder="Content / instructions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
            />
          )}
          {(newType === "video" || newType === "external_link") && (
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="URL..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
            />
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
              />
              Required
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newTitle.trim() || createModule.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {createModule.isPending ? "Adding..." : "Add Module"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
