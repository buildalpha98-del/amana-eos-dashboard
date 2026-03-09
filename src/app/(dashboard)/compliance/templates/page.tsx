"use client";

import { useState, useCallback, useMemo } from "react";
import {
  useAuditTemplates,
  useAuditTemplateDetail,
  useParseAuditDocument,
  useImportAuditItems,
  useBulkParseAudit,
  useDeleteTemplateItem,
  useUpdateTemplateItem,
  useReorderTemplateItems,
  type AuditTemplateSummary,
  type ParsedItem,
  type ParsedAuditResult,
  type BulkParseResult,
} from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  Search,
  Upload,
  FileUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowUpDown,
  Package,
} from "lucide-react";

import { ErrorState } from "@/components/ui/ErrorState";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const formatLabels: Record<string, { label: string; color: string }> = {
  yes_no: { label: "Yes / No", color: "bg-blue-100 text-blue-700" },
  rating_1_5: { label: "Rating 1-5", color: "bg-purple-100 text-purple-700" },
  compliant: { label: "Compliant", color: "bg-emerald-100 text-emerald-700" },
  reverse_yes_no: { label: "Reverse Y/N", color: "bg-amber-100 text-amber-700" },
  review_date: { label: "Review Date", color: "bg-cyan-100 text-cyan-700" },
  inventory: { label: "Inventory", color: "bg-gray-100 text-gray-600" },
};

const frequencyLabels: Record<string, string> = {
  monthly: "Monthly",
  half_yearly: "Half-Yearly",
  yearly: "Yearly",
};

/* ------------------------------------------------------------------ */
/* Sortable Item Row                                                   */
/* ------------------------------------------------------------------ */

function SortableItemRow({
  item,
  templateId,
  onDelete,
  onUpdate,
}: {
  item: { id: string; section: string | null; question: string; guidance: string | null; responseFormat: string | null; sortOrder: number; isRequired: boolean };
  templateId: string;
  onDelete: (itemId: string) => void;
  onUpdate: (itemId: string, data: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const [editing, setEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState(item.question);
  const [editSection, setEditSection] = useState(item.section || "");
  const [editGuidance, setEditGuidance] = useState(item.guidance || "");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = () => {
    onUpdate(item.id, {
      question: editQuestion,
      section: editSection || null,
      guidance: editGuidance || null,
    });
    setEditing(false);
  };

  const fmt = formatLabels[item.responseFormat || "yes_no"] || formatLabels.yes_no;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 px-3 py-2 border-b border-gray-100 bg-white hover:bg-gray-50 transition-colors",
        isDragging && "shadow-lg z-10"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 cursor-grab text-gray-400 hover:text-gray-600 shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input
              value={editSection}
              onChange={(e) => setEditSection(e.target.value)}
              placeholder="Section (optional)"
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <textarea
              value={editQuestion}
              onChange={(e) => setEditQuestion(e.target.value)}
              rows={2}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <textarea
              value={editGuidance}
              onChange={(e) => setEditGuidance(e.target.value)}
              placeholder="Guidance (optional)"
              rows={1}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover"
              >
                <Check className="w-3 h-3" /> Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {item.section && (
              <span className="text-[10px] font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded mb-0.5 inline-block">
                {item.section}
              </span>
            )}
            <p className="text-sm text-gray-900">{item.question}</p>
            {item.guidance && (
              <p className="text-xs text-gray-500 mt-0.5">{item.guidance}</p>
            )}
          </>
        )}
      </div>

      <span className={cn("px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 mt-1", fmt.color)}>
        {fmt.label}
      </span>

      {!editing && (
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button
            onClick={() => {
              setEditQuestion(item.question);
              setEditSection(item.section || "");
              setEditGuidance(item.guidance || "");
              setEditing(true);
            }}
            className="p-1 text-gray-400 hover:text-brand transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template Detail (expanded inline)                                   */
/* ------------------------------------------------------------------ */

function TemplateDetail({
  templateId,
  onUpload,
}: {
  templateId: string;
  onUpload: () => void;
}) {
  const { data: template, isLoading } = useAuditTemplateDetail(templateId);
  const deleteItem = useDeleteTemplateItem();
  const updateItem = useUpdateTemplateItem();
  const reorder = useReorderTemplateItems();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !template?.items) return;

      const oldIndex = template.items.findIndex((i) => i.id === active.id);
      const newIndex = template.items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newItems = [...template.items];
      const [moved] = newItems.splice(oldIndex, 1);
      newItems.splice(newIndex, 0, moved);

      reorder.mutate({
        templateId,
        itemIds: newItems.map((i) => i.id),
      });
    },
    [template?.items, templateId, reorder]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-brand animate-spin" />
      </div>
    );
  }

  if (!template) return null;

  const items = template.items || [];

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {items.length} Checklist Item{items.length !== 1 ? "s" : ""}
          </span>
          {template.sourceFileName && (
            <span className="text-xs text-gray-400">
              Source: {template.sourceFileName}
            </span>
          )}
        </div>
        <button
          onClick={onUpload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Items
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No checklist items yet</p>
          <p className="text-xs mt-1">Upload a .docx file to import items</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="max-h-[400px] overflow-y-auto">
              {items.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  templateId={templateId}
                  onDelete={(itemId) => deleteItem.mutate({ templateId, itemId })}
                  onUpdate={(itemId, data) => updateItem.mutate({ templateId, itemId, ...data })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parse Preview Modal                                                 */
/* ------------------------------------------------------------------ */

function ParsePreviewModal({
  templateId,
  templateName,
  onClose,
}: {
  templateId: string;
  templateName: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedAuditResult | null>(null);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"replace" | "append">("replace");

  const parseMut = useParseAuditDocument();
  const importMut = useImportAuditItems();

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".docx") || f.name.endsWith(".doc"))) {
      setFile(f);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }, []);

  const handleParse = useCallback(async () => {
    if (!file) return;
    const result = await parseMut.mutateAsync(file);
    setParsed(result);
    setRemovedIndices(new Set());
  }, [file, parseMut]);

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    const items = parsed.items.filter((_, i) => !removedIndices.has(i));
    await importMut.mutateAsync({
      templateId,
      items,
      mode,
      sourceFileName: parsed.filename,
    });
    onClose();
  }, [parsed, removedIndices, templateId, mode, importMut, onClose]);

  const filteredItems = parsed ? parsed.items.filter((_, i) => !removedIndices.has(i)) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Upload Checklist Items</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Import items into <span className="font-medium">{templateName}</span>
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!parsed ? (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand transition-colors cursor-pointer"
                onClick={() => document.getElementById("parse-file-input")?.click()}
              >
                <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  {file ? file.name : "Drop a .docx file here or click to browse"}
                </p>
                {file && (
                  <p className="text-xs text-gray-400 mt-1">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                )}
                <input
                  id="parse-file-input"
                  type="file"
                  accept=".docx,.doc"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {file && (
                <button
                  onClick={handleParse}
                  disabled={parseMut.isPending}
                  className="mt-4 w-full py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {parseMut.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Parsing...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" /> Parse Document
                    </>
                  )}
                </button>
              )}

              {parseMut.isError && (
                <p className="text-sm text-red-600 mt-3">
                  {parseMut.error.message}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Parsed preview */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {filteredItems.length} items parsed
                  </span>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full",
                    formatLabels[parsed.detectedFormat]?.color || "bg-gray-100 text-gray-600"
                  )}
                >
                  {formatLabels[parsed.detectedFormat]?.label || parsed.detectedFormat}
                </span>
                {parsed.metadata.hasReverseYesNo && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                    Has Reverse Y/N
                  </span>
                )}
              </div>

              {parsed.metadata.sections.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {parsed.metadata.sections.map((s) => (
                    <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                {parsed.items.map((item, idx) => {
                  const removed = removedIndices.has(idx);
                  const fmt = formatLabels[item.responseFormat] || formatLabels.yes_no;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-start gap-2 px-3 py-2 border-b border-gray-100 text-sm",
                        removed && "opacity-30 line-through"
                      )}
                    >
                      <span className="text-xs text-gray-400 mt-0.5 w-6 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        {item.section && (
                          <span className="text-[10px] font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded mr-1">
                            {item.section}
                          </span>
                        )}
                        <span className="text-gray-900">{item.question}</span>
                        {item.guidance && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.guidance}</p>
                        )}
                      </div>
                      <span className={cn("px-1.5 py-0.5 text-[10px] font-medium rounded-full shrink-0", fmt.color)}>
                        {fmt.label}
                      </span>
                      <button
                        onClick={() => {
                          const next = new Set(removedIndices);
                          if (removed) next.delete(idx);
                          else next.add(idx);
                          setRemovedIndices(next);
                        }}
                        className="p-0.5 text-gray-400 hover:text-red-600 shrink-0"
                        title={removed ? "Restore" : "Remove"}
                      >
                        {removed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Import options */}
              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Import mode:</label>
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    className="accent-brand"
                  />
                  Replace existing
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "append"}
                    onChange={() => setMode("append")}
                    className="accent-brand"
                  />
                  Append to existing
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {parsed && (
            <button
              onClick={handleImport}
              disabled={importMut.isPending || filteredItems.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {importMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Import {filteredItems.length} Items
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk Upload Modal                                                   */
/* ------------------------------------------------------------------ */

function BulkUploadModal({
  templates,
  onClose,
}: {
  templates: AuditTemplateSummary[];
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<BulkParseResult["results"] | null>(null);
  const [templateOverrides, setTemplateOverrides] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  const bulkParse = useBulkParseAudit();
  const importMut = useImportAuditItems();

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".docx") || f.name.endsWith(".doc")
    );
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleParse = useCallback(async () => {
    if (files.length === 0) return;
    const result = await bulkParse.mutateAsync(files);
    setResults(result.results);
  }, [files, bulkParse]);

  const handleImportAll = useCallback(async () => {
    if (!results) return;
    setImporting(true);

    const toImport = results
      .map((r, idx) => ({
        ...r,
        targetTemplateId: templateOverrides[idx] || r.match?.templateId || null,
      }))
      .filter((r) => r.parsed && r.targetTemplateId);

    setImportProgress({ done: 0, total: toImport.length });

    for (let i = 0; i < toImport.length; i++) {
      const r = toImport[i];
      try {
        await importMut.mutateAsync({
          templateId: r.targetTemplateId!,
          items: r.parsed!.items,
          mode: "replace",
          sourceFileName: r.filename,
        });
      } catch {
        // continue with others
      }
      setImportProgress({ done: i + 1, total: toImport.length });
    }

    setImporting(false);
    onClose();
  }, [results, templateOverrides, importMut, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Bulk Upload</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload multiple .docx files and auto-match to templates
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!results ? (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand transition-colors cursor-pointer"
                onClick={() => document.getElementById("bulk-file-input")?.click()}
              >
                <Package className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Drop .docx files here or click to browse
                </p>
                <input
                  id="bulk-file-input"
                  type="file"
                  accept=".docx,.doc"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg text-sm">
                      <span className="text-gray-700 truncate">{f.name}</span>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleParse}
                    disabled={bulkParse.isPending}
                    className="mt-3 w-full py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {bulkParse.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Parsing {files.length} files...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" /> Parse {files.length} Files
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {results.map((r, idx) => {
                const matchId = templateOverrides[idx] || r.match?.templateId || "";
                const confidence = r.match?.confidence ?? 0;
                return (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.filename}</p>
                      {r.error ? (
                        <p className="text-xs text-red-600">{r.error}</p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          {r.parsed?.items.length ?? 0} items ·{" "}
                          {formatLabels[r.parsed?.detectedFormat || ""]?.label || "Unknown format"}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!r.error && (
                        <>
                          <span
                            className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                              confidence >= 0.8
                                ? "bg-emerald-100 text-emerald-700"
                                : confidence >= 0.6
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            )}
                          >
                            {Math.round(confidence * 100)}%
                          </span>
                          <select
                            value={matchId}
                            onChange={(e) =>
                              setTemplateOverrides((prev) => ({ ...prev, [idx]: e.target.value }))
                            }
                            className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand max-w-[200px]"
                          >
                            <option value="">— Select template —</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {importProgress && (
            <span className="text-sm text-gray-500">
              Imported {importProgress.done}/{importProgress.total}
            </span>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {results && (
              <button
                onClick={handleImportAll}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Import All Matched
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function AuditTemplatesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [qaFilter, setQaFilter] = useState("");
  const [freqFilter, setFreqFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ id: string; name: string } | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const { data: templates = [], isLoading, error, refetch } = useAuditTemplates();

  const filtered = useMemo(() => {
    let list = templates;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.nqsReference.toLowerCase().includes(term)
      );
    }
    if (qaFilter) {
      list = list.filter((t) => t.qualityArea === parseInt(qaFilter));
    }
    if (freqFilter) {
      list = list.filter((t) => t.frequency === freqFilter);
    }
    return list;
  }, [templates, searchTerm, qaFilter, freqFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand" />
            Audit Templates
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage checklist items for {templates.length} audit templates
          </p>
        </div>
        <button
          onClick={() => setShowBulkUpload(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors"
        >
          <Package className="w-4 h-4" />
          Bulk Upload
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <select
          value={qaFilter}
          onChange={(e) => setQaFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">All Quality Areas</option>
          {[1, 2, 3, 4, 5, 6, 7].map((qa) => (
            <option key={qa} value={String(qa)}>QA{qa}</option>
          ))}
        </select>

        <select
          value={freqFilter}
          onChange={(e) => setFreqFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">All Frequencies</option>
          <option value="monthly">Monthly</option>
          <option value="half_yearly">Half-Yearly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Template List */}
      {error ? (
        <ErrorState
          title="Failed to load audit templates"
          error={error as Error}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No templates found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {filtered.map((template) => {
            const isExpanded = expandedId === template.id;
            const fmt = formatLabels[template.responseFormat] || formatLabels.yes_no;

            return (
              <div key={template.id} className="border-b border-gray-100 last:border-b-0">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : template.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {template.name}
                      </p>
                      {!template.isActive && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                        QA{template.qualityArea}
                      </span>
                      <span className="text-xs text-gray-500">{template.nqsReference}</span>
                      <span className="text-xs text-gray-400">
                        {frequencyLabels[template.frequency] || template.frequency}
                      </span>
                    </div>
                  </div>

                  <span className={cn("px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0", fmt.color)}>
                    {fmt.label}
                  </span>

                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                    {template._count.items} items
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadTarget({ id: template.id, name: template.name });
                    }}
                    className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors shrink-0"
                    title="Upload items"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </button>

                {isExpanded && (
                  <TemplateDetail
                    templateId={template.id}
                    onUpload={() => setUploadTarget({ id: template.id, name: template.name })}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Parse Modal */}
      {uploadTarget && (
        <ParsePreviewModal
          templateId={uploadTarget.id}
          templateName={uploadTarget.name}
          onClose={() => setUploadTarget(null)}
        />
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          templates={templates}
          onClose={() => setShowBulkUpload(false)}
        />
      )}
    </div>
  );
}
