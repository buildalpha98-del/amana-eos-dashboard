"use client";

import { useState, useMemo } from "react";
import {
  useDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  useDocumentFolders,
  useCreateFolder,
  useDeleteFolder,
  useMoveDocument,
  useBulkCreateDocuments,
  DocumentData,
  DocumentFolder,
} from "@/hooks/useDocuments";
import { useQuery } from "@tanstack/react-query";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV, formatDateCSV } from "@/lib/csv-export";
import {
  FileText,
  Search,
  Tag,
  Calendar,
  User,
  Trash2,
  ExternalLink,
  Grid3X3,
  List,
  X,
  Plus,
  AlertCircle,
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  FolderInput,
  Upload,
  CheckCircle2,
  Loader2,
  Pencil,
  Files,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StickyTable } from "@/components/ui/StickyTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BulkUploadModal } from "@/components/documents/BulkUploadModal";
import { toast } from "@/hooks/useToast";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  program: { bg: "bg-cyan-50", text: "text-cyan-700", badge: "bg-cyan-100" },
  policy: { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100" },
  procedure: { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100" },
  template: { bg: "bg-green-50", text: "text-green-700", badge: "bg-green-100" },
  guide: { bg: "bg-teal-50", text: "text-teal-700", badge: "bg-teal-100" },
  compliance: { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100" },
  financial: { bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100" },
  marketing: { bg: "bg-pink-50", text: "text-pink-700", badge: "bg-pink-100" },
  hr: { bg: "bg-indigo-50", text: "text-indigo-700", badge: "bg-indigo-100" },
  other: { bg: "bg-gray-50", text: "text-gray-700", badge: "bg-gray-100" },
};

const CATEGORIES = ["program", "policy", "procedure", "template", "guide", "compliance", "financial", "marketing", "hr", "other"];

interface Service {
  id: string;
  name: string;
  code: string;
}

/**
 * Convert a stored fileUrl (e.g. /uploads/file-123.pdf) to the download API
 * route so files are served reliably in both dev and standalone production builds.
 */
function getDownloadUrl(fileUrl: string): string {
  if (fileUrl.startsWith("/uploads/")) {
    const fileName = fileUrl.replace("/uploads/", "");
    return `/api/documents/download?file=${encodeURIComponent(fileName)}`;
  }
  // If it's already an absolute URL or different path, return as-is
  return fileUrl;
}

export default function DocumentsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCentre, setSelectedCentre] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showModal, setShowModal] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [docPage, setDocPage] = useState(1);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ fileName: string; fileUrl: string; fileSize: number; mimeType: string } | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "policy",
    fileName: "",
    fileUrl: "",
    centreId: "",
    tags: "",
  });

  const { data: docResult, isLoading, error, refetch } = useDocuments({
    category: selectedCategory || undefined,
    centreId: selectedCentre || undefined,
    folderId: searchTerm ? undefined : (currentFolderId || "root"),
    search: searchTerm || undefined,
    page: docPage,
    limit: 30,
  });
  const documents = docResult?.documents ?? [];
  const totalDocPages = docResult?.totalPages ?? 1;

  const { data: folders = [] } = useDocumentFolders();

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
  });

  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const updateDocument = useUpdateDocument();
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const moveDocument = useMoveDocument();
  const bulkCreate = useBulkCreateDocuments();
  const [editingDoc, setEditingDoc] = useState<DocumentData | null>(null);
  const [editDocForm, setEditDocForm] = useState({ title: "", description: "", category: "" });
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  // Build breadcrumb path
  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return [];
    const path: DocumentFolder[] = [];
    let current = folders.find(f => f.id === currentFolderId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
    }
    return path;
  }, [currentFolderId, folders]);

  // Folders in current directory
  const currentSubfolders = useMemo(() => {
    return folders.filter(f =>
      currentFolderId ? f.parentId === currentFolderId : !f.parentId
    );
  }, [folders, currentFolderId]);

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        toast({ description: err.error || "Upload failed", variant: "destructive" });
        return;
      }
      const result = await res.json();
      setUploadedFile(result);
      setFormData((prev) => ({
        ...prev,
        fileName: result.fileName,
        fileUrl: result.fileUrl,
        title: prev.title || result.fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      }));
    } catch {
      toast({ description: "Upload failed. Please try again.", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.fileName || !formData.fileUrl) {
      toast({ description: "Please upload a file and fill in the title", variant: "destructive" });
      return;
    }

    await createDocument.mutateAsync({
      title: formData.title,
      description: formData.description || undefined,
      category: formData.category,
      fileName: formData.fileName,
      fileUrl: formData.fileUrl,
      fileSize: uploadedFile?.fileSize,
      mimeType: uploadedFile?.mimeType,
      centreId: formData.centreId || null,
      folderId: currentFolderId || null,
      tags: formData.tags ? formData.tags.split(",").map(t => t.trim()) : [],
    });

    setFormData({
      title: "",
      description: "",
      category: "policy",
      fileName: "",
      fileUrl: "",
      centreId: "",
      tags: "",
    });
    setUploadedFile(null);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteDocument.mutateAsync(id);
    setDeleteDocId(null);
  };

  const handleEditDoc = (doc: DocumentData) => {
    setEditDocForm({ title: doc.title, description: doc.description || "", category: doc.category || "" });
    setEditingDoc(doc);
  };

  const handleSaveDoc = async () => {
    if (!editingDoc || !editDocForm.title.trim()) return;
    await updateDocument.mutateAsync({
      id: editingDoc.id,
      title: editDocForm.title.trim(),
      description: editDocForm.description || null,
      category: editDocForm.category || null,
    });
    setEditingDoc(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder.mutateAsync({
      name: newFolderName.trim(),
      parentId: currentFolderId || null,
    });
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder.mutateAsync(folderId);
      setDeleteFolderId(null);
    } catch (err: any) {
      toast({ description: err.message || "Failed to delete folder", variant: "destructive" });
    }
  };

  const handleMoveDocument = async (docId: string, targetFolderId: string | null) => {
    await moveDocument.mutateAsync({ id: docId, folderId: targetFolderId });
    setMoveDocId(null);
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleExport = () => {
    if (!documents || documents.length === 0) return;
    exportToCSV(
      documents.map((doc: any) => ({
        title: doc.title,
        category: doc.category,
        centre: doc.centre?.name || "",
        folder: doc.folder?.name || "",
        uploadedBy: doc.uploadedBy?.name ?? "Unknown",
        date: doc.createdAt,
        fileSize: doc.fileSize,
      })),
      "documents-export",
      [
        { key: "title", header: "Title" },
        { key: "category", header: "Category" },
        { key: "centre", header: "Centre" },
        { key: "folder", header: "Folder" },
        { key: "uploadedBy", header: "Uploaded By" },
        { key: "date", header: "Date", formatter: (v) => v ? formatDateCSV(v as string) : "" },
        { key: "fileSize", header: "File Size", formatter: (v) => formatFileSize(v as number | null) },
      ]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-brand rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <ErrorState
          title="Failed to load documents"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Document Library</h2>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">Manage and organize your policies, procedures, templates, and more.</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportButton onClick={handleExport} disabled={documents.length === 0} />
            <button
              onClick={() => setShowNewFolder(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New Folder
            </button>
            <button
              onClick={() => setShowBulkUpload(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Files className="w-4 h-4" />
              Bulk Upload
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              Upload Document
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-sm">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md transition-colors",
              !currentFolderId ? "text-brand font-medium" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            )}
          >
            <Home className="w-3.5 h-3.5" />
            All Documents
          </button>
          {breadcrumbs.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              <button
                onClick={() => setCurrentFolderId(folder.id)}
                className={cn(
                  "px-2 py-1 rounded-md transition-colors",
                  folder.id === currentFolderId ? "text-brand font-medium" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                )}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        {/* New Folder Inline Form */}
        {showNewFolder && (
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <Folder className="w-5 h-5 text-brand" />
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
              }}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createFolder.isPending}
              className="px-3 py-1.5 bg-brand text-white text-sm font-medium rounded-md hover:bg-brand-hover disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
              className="p-1.5 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setSelectedCategory(""); setDocPage(1); }}
            className={cn(
              "px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors",
              !selectedCategory
                ? "bg-brand text-white border-brand"
                : "bg-white text-gray-600 border-gray-300 hover:border-brand hover:text-brand"
            )}
          >
            All
          </button>
          {CATEGORIES.map(cat => {
            const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
            return (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(selectedCategory === cat ? "" : cat); setDocPage(1); }}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors capitalize",
                  selectedCategory === cat
                    ? `${colors.badge} ${colors.text} border-current`
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                )}
              >
                {cat === "hr" ? "HR" : cat}
              </button>
            );
          })}
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              aria-label="Search documents"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <select
            value={selectedCentre}
            onChange={(e) => setSelectedCentre(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="">All Centres</option>
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewMode === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Folder Cards */}
        {!searchTerm && currentSubfolders.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {currentSubfolders.map((folder) => (
              <div
                key={folder.id}
                className="group bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-brand/30 transition-all cursor-pointer relative"
                onClick={() => setCurrentFolderId(folder.id)}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Folder className="w-5 h-5 text-brand" />
                  <span className="text-sm font-medium text-gray-900 truncate">{folder.name}</span>
                </div>
                <p className="text-xs text-gray-400">
                  {folder._count.documents} doc{folder._count.documents !== 1 ? "s" : ""}
                  {folder._count.children > 0 && `, ${folder._count.children} folder${folder._count.children !== 1 ? "s" : ""}`}
                </p>
                {folder._count.documents === 0 && folder._count.children === 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteFolderId(folder.id); }}
                    className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete empty folder"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Documents Grid/List */}
        {documents.length === 0 && currentSubfolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No documents found</p>
            <p className="text-gray-400 text-sm mt-1">
              {searchTerm || selectedCategory || selectedCentre
                ? "Try adjusting your filters or search term."
                : currentFolderId
                ? "This folder is empty. Upload a document or create a subfolder."
                : "Upload your first document to get started."}
            </p>
            {!searchTerm && !selectedCategory && !selectedCentre && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
              >
                <Plus className="w-4 h-4" />
                Upload Document
              </button>
            )}
          </div>
        ) : documents.length === 0 ? null : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(doc => {
              const colors = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other;
              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colors.badge)}>
                      <FileText className={cn("w-5 h-5", colors.text)} />
                    </div>
                    <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full capitalize", colors.badge, colors.text)}>
                      {doc.category}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{doc.title}</h3>
                  {doc.description && (
                    <p className="text-gray-500 text-sm mb-3 line-clamp-2">{doc.description}</p>
                  )}
                  {doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {doc.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Tag className="w-3 h-3" /> {tag}
                        </span>
                      ))}
                      {doc.tags.length > 3 && (
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                          +{doc.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  {doc.centre && (
                    <p className="text-sm text-gray-500 mb-2">📍 {doc.centre.name}</p>
                  )}
                  <div className="space-y-1 mb-4 text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3" /> {doc.uploadedBy?.name ?? "Unknown"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" /> {formatDate(doc.createdAt)}
                    </div>
                    {doc.fileSize && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3" /> {formatFileSize(doc.fileSize)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <a
                      href={getDownloadUrl(doc.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-brand hover:bg-brand-hover text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> View
                    </a>
                    <button
                      onClick={() => handleEditDoc(doc)}
                      className="px-3 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                      title="Edit document"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setMoveDocId(doc.id)}
                      className="px-3 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                      title="Move to folder"
                    >
                      <FolderInput className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteDocId(doc.id)}
                      disabled={deleteDocument.isPending}
                      className="px-3 py-2 rounded-lg text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <StickyTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Document</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Centre</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Uploaded By</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map(doc => {
                    const colors = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other;
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">{doc.title}</p>
                              {doc.description && (
                                <p className="text-xs text-gray-400 line-clamp-1">{doc.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full capitalize inline-block", colors.badge, colors.text)}>
                            {doc.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {doc.centre?.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {doc.uploadedBy?.name ?? "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatFileSize(doc.fileSize)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <a
                              href={getDownloadUrl(doc.fileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:text-brand-hover transition-colors"
                              title="View document"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => handleEditDoc(doc)}
                              className="text-gray-500 hover:text-gray-700 transition-colors"
                              title="Edit document"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setMoveDocId(doc.id)}
                              className="text-gray-500 hover:text-gray-700 transition-colors"
                              title="Move to folder"
                            >
                              <FolderInput className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteDocId(doc.id)}
                              disabled={deleteDocument.isPending}
                              className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                              title="Delete document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </StickyTable>
          </div>
        )}

      {/* Pagination */}
      {totalDocPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Page {docPage} of {totalDocPages} ({docResult?.total ?? 0} documents)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDocPage((p) => Math.max(1, p - 1))}
              disabled={docPage <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setDocPage((p) => Math.min(totalDocPages, p + 1))}
              disabled={docPage >= totalDocPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Move to Folder Modal */}
      {moveDocId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">Move to Folder</h3>
              <button onClick={() => setMoveDocId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-[300px] overflow-y-auto space-y-1">
              <button
                onClick={() => handleMoveDocument(moveDocId, null)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left hover:bg-gray-100 transition-colors"
              >
                <Home className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">Root (No Folder)</span>
              </button>
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveDocument(moveDocId, folder.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left hover:bg-gray-100 transition-colors"
                  style={{ paddingLeft: folder.parentId ? "2rem" : undefined }}
                >
                  <Folder className="w-4 h-4 text-brand" />
                  <span className="text-gray-700">{folder.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{folder._count.documents}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Upload Document</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Upload a file to the library
                  {currentFolderId && breadcrumbs.length > 0 && (
                    <span className="text-brand"> in {breadcrumbs[breadcrumbs.length - 1].name}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="E.g., Staff Handbook 2025"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Brief description of the document..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Centre (Optional)
                  </label>
                  <select
                    value={formData.centreId}
                    onChange={(e) => setFormData({ ...formData, centreId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  >
                    <option value="">Not centre-specific</option>
                    {services.map(service => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  File *
                </label>
                {uploadedFile ? (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{uploadedFile.fileName}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(uploadedFile.fileSize)} &middot; {uploadedFile.mimeType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedFile(null);
                        setFormData((prev) => ({ ...prev, fileName: "", fileUrl: "" }));
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : uploadingFile ? (
                  <div className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-brand/30 rounded-lg bg-brand/5">
                    <Loader2 className="w-5 h-5 text-brand animate-spin" />
                    <span className="text-sm text-brand font-medium">Uploading...</span>
                  </div>
                ) : (
                  <label
                    className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileUpload(file);
                    }}
                  >
                    <Upload className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <span className="text-sm font-medium text-brand">Click to upload</span>
                      <span className="text-sm text-gray-500"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-gray-400">PDF, Word, Excel, PowerPoint, images up to 10MB</p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="E.g., staff, mandatory, 2025"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDocument.isPending || !uploadedFile}
                  className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {createDocument.isPending ? "Saving..." : "Upload Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {editingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Edit Document</h3>
              <button onClick={() => setEditingDoc(null)} className="p-1 rounded-md text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={editDocForm.title}
                  onChange={(e) => setEditDocForm({ ...editDocForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={editDocForm.description}
                  onChange={(e) => setEditDocForm({ ...editDocForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select
                  value={editDocForm.category}
                  onChange={(e) => setEditDocForm({ ...editDocForm, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  <option value="">No category</option>
                  {["program", "policy", "procedure", "template", "guide", "compliance", "financial", "marketing", "hr", "other"].map(cat => (
                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDoc}
                  disabled={updateDocument.isPending || !editDocForm.title.trim()}
                  className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {updateDocument.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          open={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          categories={CATEGORIES}
          services={services}
          currentFolderId={currentFolderId}
          breadcrumbs={breadcrumbs}
          bulkCreate={bulkCreate}
          formatFileSize={formatFileSize}
        />
      )}

      <ConfirmDialog
        open={!!deleteDocId}
        onOpenChange={(open) => !open && setDeleteDocId(null)}
        title="Delete Document"
        description="Are you sure you want to delete this document? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteDocId && handleDelete(deleteDocId)}
        loading={deleteDocument.isPending}
      />

      <ConfirmDialog
        open={!!deleteFolderId}
        onOpenChange={(open) => !open && setDeleteFolderId(null)}
        title="Delete Folder"
        description="Delete this folder? It must be empty."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteFolderId && handleDeleteFolder(deleteFolderId)}
        loading={deleteFolder.isPending}
      />
    </div>
  );
}
