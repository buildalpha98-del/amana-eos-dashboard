"use client";

import { useState, useMemo } from "react";
import { useDocuments, useCreateDocument, useDeleteDocument, DocumentData } from "@/hooks/useDocuments";
import { useQuery } from "@tanstack/react-query";
import { prisma } from "@/lib/prisma";
import {
  FileText,
  Search,
  Filter,
  Upload,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#004E64] border-t-[#FECE00] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#004E64]">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFAE6] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[#004E64] mb-2">Document Library</h1>
          <p className="text-[#004E64]/70">Manage and organize your policies, procedures, templates, and more.</p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-l-4 border-[#FECE00]">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-[#004E64]/50" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00]"
              />
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00] text-[#004E64]"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="capitalize">
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Centre Filter */}
            <div>
              <select
                value={selectedCentre}
                onChange={(e) => setSelectedCentre(e.target.value)}
                className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00] text-[#004E64]"
              >
                <option value="">All Centres</option>
                {services.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  viewMode === "grid"
                    ? "bg-[#004E64] text-white"
                    : "bg-[#004E64]/10 text-[#004E64] hover:bg-[#004E64]/20"
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  viewMode === "list"
                    ? "bg-[#004E64] text-white"
                    : "bg-[#004E64]/10 text-[#004E64] hover:bg-[#004E64]/20"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => setShowModal(true)}
            className="w-full md:w-auto bg-[#FECE00] hover:bg-[#FECE00]/90 text-[#004E64] font-semibold px-6 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Upload Document
          </button>
        </div>

        {/* Documents Grid/List */}
        {documents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center border-l-4 border-[#004E64]/20">
            <FileText className="w-16 h-16 text-[#004E64]/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#004E64] mb-2">No documents found</h3>
            <p className="text-[#004E64]/70 mb-6">
              {searchTerm || selectedCategory || selectedCentre
                ? "Try adjusting your filters or search term."
                : "Upload your first document to get started."}
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#FECE00] hover:bg-[#FECE00]/90 text-[#004E64] font-semibold px-6 py-2 rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Document
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map(doc => {
              const colors = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other;
              return (
                <div
                  key={doc.id}
                  className={`${colors.bg} rounded-lg shadow-sm p-6 border-l-4 ${colors.text} hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <FileText className="w-8 h-8 text-current opacity-70" />
                    <span className={`${colors.badge} ${colors.text} text-xs font-semibold px-3 py-1 rounded-full capitalize`}>
                      {doc.category}
                    </span>
                  </div>
                  <h3 className="font-semibold text-[#004E64] mb-2 line-clamp-2">{doc.title}</h3>
                  {doc.description && (
                    <p className="text-[#004E64]/70 text-sm mb-4 line-clamp-2">{doc.description}</p>
                  )}
                  {doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {doc.tags.slice(0, 2).map(tag => (
                        <span key={tag} className={`${colors.badge} ${colors.text} text-xs px-2 py-1 rounded flex items-center gap-1`}>
                          <Tag className="w-3 h-3" /> {tag}
                        </span>
                      ))}
                      {doc.tags.length > 2 && (
                        <span className={`${colors.badge} ${colors.text} text-xs px-2 py-1 rounded`}>
                          +{doc.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                  {doc.centre && (
                    <p className="text-sm text-[#004E64]/70 mb-2">{doc.centre.name}</p>
                  )}
                  <div className="space-y-1 mb-4 text-xs text-[#004E64]/70">
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
                  <div className="flex gap-2">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-[#004E64] hover:bg-[#004E64]/90 text-white px-3 py-2 rounded text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> View
                    </a>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleteDocument.isPending}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden border-l-4 border-[#FECE00]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#004E64] text-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Document</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Category</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Centre</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Uploaded By</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Size</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#004E64]/10">
                  {documents.map(doc => {
                    const colors = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other;
                    return (
                      <tr key={doc.id} className="hover:bg-[#FFFAE6] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-[#004E64]/50" />
                            <div>
                              <p className="font-semibold text-[#004E64]">{doc.title}</p>
                              {doc.description && (
                                <p className="text-sm text-[#004E64]/70 line-clamp-1">{doc.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`${colors.badge} ${colors.text} text-xs font-semibold px-3 py-1 rounded-full capitalize inline-block`}>
                            {doc.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#004E64]">
                          {doc.centre?.name || "—"}
                        </td>
                        <td className="px-6 py-4 text-[#004E64]">
                          {doc.uploadedBy.name}
                        </td>
                        <td className="px-6 py-4 text-[#004E64]">
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-[#004E64]">
                          {formatFileSize(doc.fileSize)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#004E64] hover:text-[#FECE00] transition-colors"
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
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#004E64] text-white p-6 flex items-center justify-between border-b-4 border-[#FECE00]">
              <div className="flex items-center gap-3">
                <Upload className="w-6 h-6" />
                <h2 className="text-2xl font-bold">Upload Document</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-[#004E64]/80 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#004E64] mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00]"
                  placeholder="E.g., Staff Handbook 2025"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#004E64] mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00]"
                  placeholder="Brief description of the document..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#004E64] mb-2">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00] text-[#004E64]"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#004E64] mb-2">
                    Centre (Optional)
                  </label>
                  <select
                    value={formData.centreId}
                    onChange={(e) => setFormData({ ...formData, centreId: e.target.value })}
                    className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00] text-[#004E64]"
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
                <label className="block text-sm font-semibold text-[#004E64] mb-2">
                  File Name *
                </label>
                <input
                  type="text"
                  value={formData.fileName}
                  onChange={(e) => setFormData({ ...formData, fileName: e.target.value })}
                  className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00]"
                  placeholder="E.g., staff-handbook-2025.pdf"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#004E64] mb-2">
                  File URL *
                </label>
                <input
                  type="url"
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00]"
                  placeholder="E.g., https://example.com/documents/handbook.pdf"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#004E64] mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-4 py-2 border border-[#004E64]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FECE00]"
                  placeholder="E.g., staff, mandatory, 2025"
                />
              </div>

              <div className="bg-[#FFFAE6] border border-[#FECE00] rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-[#004E64] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[#004E64]">
                  Currently, file URLs are used as references. Full file upload storage integration can be added in the next phase.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-[#004E64]/20 text-[#004E64] font-semibold rounded-lg hover:bg-[#FFFAE6] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDocument.isPending}
                  className="flex-1 bg-[#FECE00] hover:bg-[#FECE00]/90 text-[#004E64] font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
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
