"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Plus,
  Search,
  ExternalLink,
  FileText,
  Check,
  X,
  Loader2,
  ChevronRight,
  Users,
  Sparkles,
  Download,
} from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import type { Role } from "@prisma/client";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import {
  usePolicies,
  usePolicy,
  usePolicyCompliance,
  useCreatePolicy,
  useUpdatePolicy,
  useDeletePolicy,
  useAcknowledgePolicy,
  type PolicyData,
  type PolicyCompliance,
} from "@/hooks/usePolicies";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-500" },
  published: { label: "Published", color: "bg-green-50 text-green-700" },
  archived: { label: "Archived", color: "bg-amber-50 text-amber-700" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PoliciesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user?.role as Role) || "staff";
  const isAdmin = isAdminRole(role);

  const [mainTab, setMainTab] = useState<"policies" | "compliance">("policies");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const { data: policies, isLoading } = usePolicies({
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter || undefined,
  });

  // Derive categories for the dropdown
  const categories = Array.from(
    new Set((policies || []).map((p) => p.category).filter(Boolean))
  ) as string[];

  // Filter by search
  const filtered = (policies || []).filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Policies"
        description="Manage and track policy compliance"
        primaryAction={
          isAdmin
            ? { label: "New Policy", icon: Plus, onClick: () => setShowCreate(true) }
            : undefined
        }
        secondaryActions={[
          {
            label: "Export",
            icon: Download,
            onClick: () =>
              exportToCsv("policies", filtered, [
                { header: "Title", accessor: (p) => p.title },
                { header: "Version", accessor: (p) => p.version },
                { header: "Status", accessor: (p) => p.status },
                { header: "Category", accessor: (p) => p.category ?? "" },
                { header: "Acknowledgements", accessor: (p) => p._count?.acknowledgements ?? 0 },
              ]),
          },
          ...(role === "owner"
            ? [
                {
                  label: "Seed Policies",
                  icon: Sparkles,
                  loading: seeding,
                  onClick: async () => {
                    setSeeding(true);
                    try {
                      const res = await fetch("/api/policies/seed", { method: "POST" });
                      const data = await res.json();
                      toast({ description: data.message || "Policies seeded!" });
                      queryClient.invalidateQueries({ queryKey: ["policies"] });
                    } catch {
                      toast({ description: "Failed to seed policies", variant: "destructive" });
                    } finally {
                      setSeeding(false);
                    }
                  },
                },
              ]
            : []),
        ]}
        {...(isAdmin
          ? {
              toggles: [
                {
                  options: [
                    { icon: Shield, label: "Policies", value: "policies" },
                    { icon: Users, label: "Compliance", value: "compliance" },
                  ],
                  value: mainTab,
                  onChange: (v: string) => setMainTab(v as "policies" | "compliance"),
                },
              ],
            }
          : {})}
      />

      {/* Tab content */}
      {mainTab === "policies" ? (
        <PoliciesTab
          policies={filtered}
          isLoading={isLoading}
          isAdmin={isAdmin}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          categories={categories}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedId}
        />
      ) : (
        <ComplianceTab />
      )}

      {/* Detail panel */}
      {selectedId && (
        <PolicyDetailPanel
          policyId={selectedId}
          onClose={() => setSelectedId(null)}
          isAdmin={isAdmin}
          userId={session?.user?.id || ""}
        />
      )}

      {/* Create/Edit modal */}
      {showCreate && (
        <PolicyModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policies Tab
// ---------------------------------------------------------------------------

function PoliciesTab({
  policies,
  isLoading,
  isAdmin,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  categories,
  search,
  onSearchChange,
  onSelect,
}: {
  policies: PolicyData[];
  isLoading: boolean;
  isAdmin: boolean;
  statusFilter: string;
  onStatusChange: (s: string) => void;
  categoryFilter: string;
  onCategoryChange: (s: string) => void;
  categories: string[];
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (id: string) => void;
}) {
  const tabs = isAdmin ? STATUS_TABS : [{ key: "all", label: "All" }];

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-surface rounded-xl p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onStatusChange(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search policies..."
            aria-label="Search policies"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {/* Table / List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <Shield className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            No Policies Found
          </h3>
          <p className="text-sm text-foreground/50">
            {search
              ? "No policies match your search."
              : "Create your first policy to get started."}
          </p>
        </div>
      ) : (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface/50 text-xs font-medium text-foreground/50 border-b border-border">
            <div className="col-span-4">Title</div>
            <div className="col-span-1">Version</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Acknowledged</div>
            <div className="col-span-1">Link</div>
          </div>

          {policies.map((policy) => (
            <PolicyRow key={policy.id} policy={policy} onClick={() => onSelect(policy.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function PolicyRow({
  policy,
  onClick,
}: {
  policy: PolicyData;
  onClick: () => void;
}) {
  const badge = STATUS_BADGE[policy.status] || STATUS_BADGE.draft;
  const ackCount = policy._count?.acknowledgements ?? 0;

  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 text-left border-b border-border last:border-b-0 hover:bg-surface/30 transition-colors"
    >
      {/* Title */}
      <div className="sm:col-span-4 flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 text-foreground/30 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {policy.title}
        </span>
      </div>

      {/* Version */}
      <div className="sm:col-span-1 flex items-center">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          v{policy.version}
        </span>
      </div>

      {/* Status */}
      <div className="sm:col-span-2 flex items-center">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Category */}
      <div className="sm:col-span-2 flex items-center">
        <span className="text-xs text-foreground/60 truncate">
          {policy.category || "—"}
        </span>
      </div>

      {/* Ack count */}
      <div className="sm:col-span-2 flex items-center">
        <span className="text-xs text-foreground/60">{ackCount}</span>
      </div>

      {/* Document link */}
      <div className="sm:col-span-1 flex items-center">
        {policy.documentUrl ? (
          <a
            href={policy.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-brand hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-foreground/30 text-xs">—</span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Compliance Tab
// ---------------------------------------------------------------------------

function ComplianceTab() {
  const { data, isLoading } = usePolicyCompliance();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-background border border-border rounded-xl p-12 text-center">
        <Users className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-1">
          No Published Policies
        </h3>
        <p className="text-sm text-foreground/50">
          Publish a policy to start tracking compliance.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      {/* Desktop header */}
      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface/50 text-xs font-medium text-foreground/50 border-b border-border">
        <div className="col-span-3">Policy</div>
        <div className="col-span-1">Version</div>
        <div className="col-span-2">Published</div>
        <div className="col-span-1">Total</div>
        <div className="col-span-1">Acked</div>
        <div className="col-span-1">Pending</div>
        <div className="col-span-3">Compliance</div>
      </div>

      {data.map((row) => (
        <ComplianceRow key={row.id} row={row} />
      ))}
    </div>
  );
}

function ComplianceRow({ row }: { row: PolicyCompliance }) {
  const barColor =
    row.complianceRate >= 90
      ? "bg-green-500"
      : row.complianceRate >= 70
      ? "bg-amber-500"
      : "bg-red-500";

  const textColor =
    row.complianceRate >= 90
      ? "text-green-700"
      : row.complianceRate >= 70
      ? "text-amber-700"
      : "text-red-700";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 border-b border-border last:border-b-0">
      {/* Policy */}
      <div className="sm:col-span-3 flex items-center gap-2 min-w-0">
        <Shield className="h-4 w-4 text-foreground/30 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {row.title}
        </span>
      </div>

      {/* Version */}
      <div className="sm:col-span-1 flex items-center">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          v{row.version}
        </span>
      </div>

      {/* Published date */}
      <div className="sm:col-span-2 flex items-center">
        <span className="text-xs text-foreground/60">
          {row.publishedAt
            ? new Date(row.publishedAt).toLocaleDateString()
            : "—"}
        </span>
      </div>

      {/* Total */}
      <div className="sm:col-span-1 flex items-center">
        <span className="text-xs text-foreground/60">{row.totalStaff}</span>
      </div>

      {/* Acked */}
      <div className="sm:col-span-1 flex items-center">
        <span className="text-xs text-green-600 font-medium">{row.acknowledgedCount}</span>
      </div>

      {/* Pending */}
      <div className="sm:col-span-1 flex items-center">
        <span className="text-xs text-amber-600 font-medium">{row.pendingCount}</span>
      </div>

      {/* Compliance bar */}
      <div className="sm:col-span-3 flex items-center gap-2">
        <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${row.complianceRate}%` }}
          />
        </div>
        <span className={`text-xs font-semibold min-w-[36px] text-right ${textColor}`}>
          {row.complianceRate}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policy Detail Panel (slide-over)
// ---------------------------------------------------------------------------

function PolicyDetailPanel({
  policyId,
  onClose,
  isAdmin,
  userId,
}: {
  policyId: string;
  onClose: () => void;
  isAdmin: boolean;
  userId: string;
}) {
  const { data: policy, isLoading } = usePolicy(policyId);
  const acknowledge = useAcknowledgePolicy();
  const deletePolicy = useDeletePolicy();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const badge = policy ? STATUS_BADGE[policy.status] || STATUS_BADGE.draft : null;

  // Check if user has already acknowledged at current version
  const hasAcked =
    policy?.acknowledgements?.some(
      (a) => a.userId === userId && a.policyVersion === policy.version
    ) || false;

  const canAcknowledge =
    policy?.status === "published" && !hasAcked;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-background border-l border-border shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-lg font-semibold text-foreground truncate">
            Policy Details
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
          >
            <X className="h-5 w-5 text-foreground/50" />
          </button>
        </div>

        {isLoading || !policy ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Title + status */}
            <div>
              <h3 className="text-xl font-bold text-foreground">{policy.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                {badge && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  v{policy.version}
                </span>
                {policy.category && (
                  <span className="text-xs text-foreground/50">
                    {policy.category}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {policy.description && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-1">Description</h4>
                <p className="text-sm text-foreground/60 whitespace-pre-wrap">
                  {policy.description}
                </p>
              </div>
            )}

            {/* Document link */}
            {policy.documentUrl && (
              <a
                href={policy.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View Document
              </a>
            )}

            {/* Stats */}
            {policy.stats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface rounded-xl p-3 text-center">
                  <p className="text-xs text-foreground/50">Total Staff</p>
                  <p className="text-lg font-bold text-foreground">{policy.stats.totalStaff}</p>
                </div>
                <div className="bg-surface rounded-xl p-3 text-center">
                  <p className="text-xs text-foreground/50">Acknowledged</p>
                  <p className="text-lg font-bold text-green-600">{policy.stats.acknowledgedCount}</p>
                </div>
                <div className="bg-surface rounded-xl p-3 text-center">
                  <p className="text-xs text-foreground/50">Pending</p>
                  <p className="text-lg font-bold text-amber-600">{policy.stats.pendingCount}</p>
                </div>
              </div>
            )}

            {/* Acknowledge button */}
            {canAcknowledge && (
              <button
                onClick={() => acknowledge.mutate(policyId)}
                disabled={acknowledge.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                {acknowledge.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Acknowledge Policy
              </button>
            )}

            {hasAcked && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-medium">
                <Check className="h-4 w-4" />
                You have acknowledged this policy (v{policy.version})
              </div>
            )}

            {/* Acknowledgements list */}
            {policy.acknowledgements && policy.acknowledgements.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground/70 mb-2">
                  Acknowledgements ({policy.acknowledgements.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {policy.acknowledgements.map((ack) => (
                    <div
                      key={ack.id}
                      className="flex items-center justify-between px-3 py-2 bg-surface rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                          {ack.user.avatar ? (
                            <img
                              src={ack.user.avatar}
                              alt={`${ack.user.name}'s avatar`}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-medium text-brand">
                              {ack.user.name?.[0] || "?"}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {ack.user.name}
                          </p>
                          <p className="text-[10px] text-foreground/40 truncate">
                            {ack.user.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                          v{ack.policyVersion}
                        </span>
                        <span className="text-[10px] text-foreground/40">
                          {new Date(ack.acknowledgedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin actions */}
            {isAdmin && (
              <div className="flex gap-2 pt-4 border-t border-border">
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-foreground bg-surface rounded-xl hover:bg-surface/80 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowDelete(true)}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {showEdit && policy && (
        <PolicyModal
          policy={policy}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Policy"
        description="Are you sure you want to delete this policy? This action can be undone by an administrator."
        confirmLabel="Delete"
        variant="danger"
        loading={deletePolicy.isPending}
        onConfirm={() => {
          deletePolicy.mutate(policyId, {
            onSuccess: () => {
              setShowDelete(false);
              onClose();
            },
          });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Modal
// ---------------------------------------------------------------------------

function PolicyModal({
  policy,
  onClose,
}: {
  policy?: Pick<PolicyData, "id" | "title" | "description" | "category" | "documentUrl" | "status" | "requiresReack">;
  onClose: () => void;
}) {
  const create = useCreatePolicy();
  const update = useUpdatePolicy();
  const isEdit = !!policy;

  const [title, setTitle] = useState(policy?.title || "");
  const [description, setDescription] = useState(policy?.description || "");
  const [category, setCategory] = useState(policy?.category || "");
  const [documentUrl, setDocumentUrl] = useState(policy?.documentUrl || "");
  const [status, setStatus] = useState<"draft" | "published" | "archived">(
    policy?.status || "draft"
  );
  const [requiresReack, setRequiresReack] = useState(
    policy?.requiresReack ?? true
  );

  const isPending = create.isPending || update.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ description: "Title is required" });
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      documentUrl: documentUrl.trim() || undefined,
      status,
      requiresReack,
    };

    if (isEdit && policy) {
      update.mutate(
        { id: policy.id, ...payload },
        { onSuccess: () => onClose() }
      );
    } else {
      create.mutate(payload, { onSuccess: () => onClose() });
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-md bg-background rounded-xl shadow-2xl border border-border">
        <form onSubmit={handleSubmit}>
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {isEdit ? "Edit Policy" : "New Policy"}
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Policy title"
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Policy description..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Health & Safety, HR"
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>

              {/* Document URL */}
              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">
                  Document URL
                </label>
                <input
                  type="url"
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as "draft" | "published" | "archived")
                  }
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Requires Re-acknowledgement */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresReack}
                  onChange={(e) => setRequiresReack(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                />
                <span className="text-sm text-foreground/70">
                  Require re-acknowledgement on version change
                </span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-foreground/70 bg-surface rounded-xl hover:bg-surface/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Policy"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
