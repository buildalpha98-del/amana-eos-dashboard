"use client";

import { useState, useMemo } from "react";
import { useDocuments, useCreateDocument, useDeleteDocument, DocumentData } from "@/hooks/useDocuments";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
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

const CATEGORIES = ["policy", "procedure", "template", "guide", "compliance", "financial", "marketing", "hr", "other"];

interface Service {
  id: string;
  name: string;
  code: string;
}

export default function DocumentsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCentre, setSelectedCentre] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "policy",
    fileName: "",
    fileUrl: "",
    centreId: "",
    tags: "",
  });

  const { data: documents = [], isLoading } = useDocuments({
    category: selectedCategory || undefined,
    centreId: selectedCentre || undefined,
    search: searchTerm || undefined,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
  });

  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.fileName || !formData.fileUrl) {
      alert("Please fill in all required fields");
      return;
    }

    await createDocument.mutateAsync({
      title: formData.title,
      description: formData.description || undefined,
      category: formData.category,
      fileName: formData.fileName,
      fileUrl: formData.fileUrl,
      centreId: formData.centreId || null,
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
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this document?")) {
      await deleteDocument.mutateAsync(id);
    }
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
        uploadedBy: doc.uploadedBy.name,
        date: doc.createdAt,
        fileSize: doc.fileSize,
      })),
      "documents-export",
      [
        { key: "title", header: "Title" },
        { key: "category", header: "Category" },
        { key: "centre", header: "Centre" },
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
          <div className="w-12 h-12 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Document Library</h2>
            <p className="text-gray-500 mt-1">Manage and organize your policies, procedures, templates, and more.</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportButton onClick={handleExport} disabled={documents.length === 0} />
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Upload Document
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={selectedCentre}
            onChange={(e) => setSelectedCentre(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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

        {/* Documents Grid/List */}
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No documents found</p>
            <p className="text-gray-400 text-sm mt-1">
              {searchTerm || selectedCategory || selectedCentre
                ? "Try adjusting your filters or search term."
                : "Upload your first document to get started."}
            </p>
            {!searchTerm && !selectedCategory && !selectedCentre && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Upload Document
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
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
                      <User className="w-3 h-3" /> {doc.uploadedBy.name}
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
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-[#004E64] hover:bg-[#003D52] text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> View
                    </a>
                    <button
                      onClick={() => handleDelete(doc.id)}
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
            <div className="overflow-x-auto">
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
                          {doc.uploadedBy.name}
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
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#004E64] hover:text-[#003D52] transition-colors"
                              title="View document"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => handleDelete(doc.id)}
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
                <p className="text-sm text-gray-500 mt-0.5">Add a document link to the library</p>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  File Name *
                </label>
                <input
                  type="text"
                  value={formData.fileName}
                  onChange={(e) => setFormData({ ...formData, fileName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  placeholder="E.g., staff-handbook-2025.pdf"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  File URL *
                </label>
                <input
                  type="url"
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  placeholder="E.g., https://example.com/documents/handbook.pdf"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  placeholder="E.g., staff, mandatory, 2025"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Currently, file URLs are used as references. Full file upload storage integration can be added in the next phase.
                </p>
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
                  disabled={createDocument.isPending}
                  className="flex-1 bg-[#004E64] hover:bg-[#003D52] text-white font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {createDocument.isPending ? "Uploading..." : "Upload Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
