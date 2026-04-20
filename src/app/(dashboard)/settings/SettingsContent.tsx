"use client";

import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ImportWizard } from "@/components/import/ImportWizard";
import { BulkInviteModal } from "@/components/settings/BulkInviteModal";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedBadge } from "@/components/ui/UnsavedBadge";
import {
  Settings,
  Users,
  Database,
  UserPlus,
  Shield,
  ShieldCheck,
  User,
  MoreVertical,
  X,
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  Loader2,
  Link2,
  Unlink,
  RefreshCw,
  ArrowRight,
  MapPin,
  FileSpreadsheet,
  Lock,
  CheckCircle2,
  XCircle,
  Key,
  CloudCog,
  Save,
  Copy,
  AlertTriangle,
  Building2,
  Sparkles,
  BarChart3,
  Zap,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import type { Role } from "@prisma/client";
import {
  permissionsTable,
  ROLE_DISPLAY_NAMES,
  type PermissionRow,
} from "@/lib/role-permissions";
import {
  useXeroStatus,
  useXeroConnect,
  useXeroDisconnect,
  useXeroTrackingCategories,
  useXeroAccounts,
  useXeroMappings,
  useSaveXeroMappings,
  useXeroSync,
} from "@/hooks/useXero";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/hooks/useApiKeys";
import {
  useOwnaStatus,
  useUpdateOwnaMapping,
  useOwnaSync,
} from "@/hooks/useOwna";
import { AUSTRALIAN_STATES } from "@/lib/service-scope";
import { AdoptionDashboard } from "@/components/admin/AdoptionDashboard";
import { BannerManagementSection } from "@/components/settings/BannerManagementSection";
import { NotificationLogTab } from "@/components/settings/NotificationLogTab";
import { PageHeader } from "@/components/layout/PageHeader";
import { Mail } from "lucide-react";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

function InviteUserModal({
  open,
  onClose,
  currentUserRole,
}: {
  open: boolean;
  onClose: () => void;
  currentUserRole: Role;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [serviceId, setServiceId] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");

  // Fetch services for the service picker
  const { data: services } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
  });

  const needsService = role === "staff" || role === "member";
  const needsState = role === "admin";

  const createUser = useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      password: string;
      role: Role;
      serviceId?: string | null;
      state?: string | null;
    }) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      setServiceId("");
      setState("");
      setError("");
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">
            Invite Team Member
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate({ name, email, password, role, serviceId: needsService ? serviceId || null : null, state: needsState ? state || null : null });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="john@amanaoshc.com.au"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Temporary Password
            </label>
            <input
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="Set a temporary password"
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value as Role); if (e.target.value !== "staff" && e.target.value !== "member") setServiceId(""); if (e.target.value !== "admin") setState(""); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="staff">{ROLE_DISPLAY_NAMES.staff}</option>
              <option value="member">{ROLE_DISPLAY_NAMES.member}</option>
              <option value="coordinator">{ROLE_DISPLAY_NAMES.coordinator}</option>
              <option value="marketing">{ROLE_DISPLAY_NAMES.marketing}</option>
              <option value="admin">{ROLE_DISPLAY_NAMES.admin}</option>
              {currentUserRole === "owner" && <option value="head_office">{ROLE_DISPLAY_NAMES.head_office}</option>}
              {currentUserRole === "owner" && <option value="owner">{ROLE_DISPLAY_NAMES.owner}</option>}
            </select>
          </div>

          {needsService && (
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Service / Centre <span className="text-red-500">*</span>
              </label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Select a service...</option>
                {services?.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} ({svc.code})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                {role === "staff" ? ROLE_DISPLAY_NAMES.staff + "s" : ROLE_DISPLAY_NAMES.member + "s"} are scoped to their assigned service
              </p>
            </div>
          )}

          {needsState && (
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Select a state...</option>
                {AUSTRALIAN_STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label} ({s.value})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                {ROLE_DISPLAY_NAMES.admin}s are scoped to services within their assigned state
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createUser.isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleIcon({ role }: { role: Role }) {
  switch (role) {
    case "owner":
      return <ShieldCheck className="w-4 h-4 text-accent" />;
    case "head_office":
      return <Building2 className="w-4 h-4 text-purple-500" />;
    case "admin":
      return <Shield className="w-4 h-4 text-brand" />;
    default:
      return <User className="w-4 h-4 text-muted" />;
  }
}

function UserRow({
  user,
  isOwner,
  canManageUsers,
}: {
  user: UserData;
  isOwner: boolean;
  canManageUsers: boolean;
}) {
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  const deleteUser = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowDeleteConfirm(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const updateRole = useMutation({
    mutationFn: async (newRole: Role) => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowMenu(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const [resetError, setResetError] = useState("");

  const resetPassword = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reset password");
      }
      return res.json();
    },
    onSuccess: () => {
      setResetError("");
      setResetSuccess(true);
      setTimeout(() => { setResetSuccess(false); setShowResetPw(false); setNewPassword(""); }, 2000);
    },
    onError: (err: Error) => {
      setResetError(err.message);
    },
  });

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-xs font-medium text-brand">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground">{user.name}</p>
              {user.email === "admin@amanaoshc.com.au" && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface text-muted border border-border">
                  System
                </span>
              )}
            </div>
            <p className="text-xs text-muted">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize">
          <RoleIcon role={user.role} />
          {ROLE_DISPLAY_NAMES[user.role] ?? user.role}
        </span>
      </td>
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            user.active
              ? "bg-green-50 text-green-700"
              : "bg-surface text-muted"
          }`}
        >
          {user.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="py-3 px-4 text-xs text-muted">
        {new Date(user.createdAt).toLocaleDateString("en-AU")}
      </td>
      <td className="py-3 px-4">
        {canManageUsers && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-48 bg-card rounded-lg shadow-lg border border-border py-1 z-20 max-h-[calc(100vh-200px)] overflow-y-auto">
                  <button
                    onClick={() => updateRole.mutate("staff")}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                  >
                    Set as {ROLE_DISPLAY_NAMES.staff}
                  </button>
                  <button
                    onClick={() => updateRole.mutate("member")}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                  >
                    Set as {ROLE_DISPLAY_NAMES.member}
                  </button>
                  <button
                    onClick={() => updateRole.mutate("coordinator")}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                  >
                    Set as {ROLE_DISPLAY_NAMES.coordinator}
                  </button>
                  <button
                    onClick={() => updateRole.mutate("marketing")}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                  >
                    Set as {ROLE_DISPLAY_NAMES.marketing}
                  </button>
                  <button
                    onClick={() => updateRole.mutate("admin")}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                  >
                    Set as {ROLE_DISPLAY_NAMES.admin}
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => updateRole.mutate("head_office")}
                      className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                    >
                      Set as {ROLE_DISPLAY_NAMES.head_office}
                    </button>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => updateRole.mutate("owner")}
                      className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface"
                    >
                      Set as {ROLE_DISPLAY_NAMES.owner}
                    </button>
                  )}
                  <hr className="my-1" />
                  <button
                    onClick={() => toggleActive.mutate()}
                    disabled={toggleActive.isPending}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {user.active ? "Deactivate" : "Reactivate"}
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => { setShowResetPw(true); setShowMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-surface flex items-center gap-2"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Reset Password
                  </button>
                  {isOwner && (
                    <>
                      <hr className="my-1" />
                      <button
                        onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-medium"
                      >
                        Delete Permanently
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {showResetPw && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">Reset Password</h3>
                <button onClick={() => { setShowResetPw(false); setNewPassword(""); setResetError(""); }} className="p-1 text-muted hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted mb-4">Set a new password for <span className="font-medium text-foreground">{user.name}</span></p>
              {resetError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {resetError}
                </div>
              )}
              {resetSuccess ? (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Password reset successfully!
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent mb-4"
                    minLength={8}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowResetPw(false); setNewPassword(""); setResetError(""); }}
                      className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setResetError(""); resetPassword.mutate(newPassword); }}
                      disabled={newPassword.length < 8 || resetPassword.isPending}
                      className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 text-sm"
                    >
                      {resetPassword.isPending ? "Resetting..." : "Reset"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Delete User</h3>
                  <p className="text-sm text-muted">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-muted mb-4">
                Are you sure you want to permanently delete <span className="font-medium text-foreground">{user.name}</span>? All their data (todos, rocks, issues, timesheets, etc.) will be removed or unlinked.
              </p>
              {deleteUser.isError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {deleteUser.error instanceof Error ? deleteUser.error.message : "Failed to delete user"}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteUser.mutate()}
                  disabled={deleteUser.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
                >
                  {deleteUser.isPending ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ——— Activity Log ———

interface ActivityLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

const entityTypeOptions = [
  "All",
  "Rock",
  "Todo",
  "Issue",
  "Project",
  "Meeting",
  "Service",
  "Document",
  "SupportTicket",
  "ProjectTemplate",
  "User",
];

const actionBadge: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-blue-50 text-blue-700",
  delete: "bg-red-50 text-red-700",
};

function ActivityLogPanel() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");

  const { data, isLoading } = useQuery<{
    logs: ActivityLogEntry[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["activity-log", page, entityType],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (entityType) params.set("entityType", entityType);
      const res = await fetch(`/api/activity-log?${params}`);
      if (!res.ok) throw new Error("Failed to fetch activity log");
      return res.json();
    },
  });

  const logs = data?.logs || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-muted" />
          <h3 className="text-lg font-semibold text-foreground">Activity Log</h3>
          {data && (
            <span className="text-xs text-muted">
              {data.total} entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted" />
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {entityTypeOptions.map((t) => (
              <option key={t} value={t === "All" ? "" : t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted">Loading activity...</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={Activity} title="No Activity" description="No activity recorded yet. Actions will appear here as users interact with the dashboard." variant="inline" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">When</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">User</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Action</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Type</th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const details = log.details || {};
                  const detailStr = Object.entries(details)
                    .filter(([k]) => k !== "templateId")
                    .map(([k, v]) => {
                      if (typeof v === "object") return null;
                      return `${k}: ${v}`;
                    })
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-surface/50">
                      <td className="py-2.5 px-3 text-xs text-muted whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString("en-AU", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-sm font-medium text-foreground">
                          {log.user.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                            actionBadge[log.action] || "bg-surface text-muted"
                          )}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted">
                        {log.entityType}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted max-w-xs truncate">
                        {detailStr || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
              <span className="text-xs text-muted">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface OrgSettingsData {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  updatedAt: string;
}

function OrgSettingsSection({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#004E64");
  const [accentColor, setAccentColor] = useState("#FECE00");
  const [saved, setSaved] = useState(false);

  const { data: orgSettings, isLoading: orgLoading } = useQuery<OrgSettingsData>({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch("/api/org-settings");
      if (!res.ok) throw new Error("Failed to fetch org settings");
      return res.json();
    },
  });

  // Sync local state when data loads
  useEffect(() => {
    if (orgSettings) {
      setOrgName(orgSettings.name);
      setPrimaryColor(orgSettings.primaryColor);
      setAccentColor(orgSettings.accentColor);
    }
  }, [orgSettings]);

  const updateOrg = useMutation({
    mutationFn: async (data: { name?: string; primaryColor?: string; accentColor?: string }) => {
      const res = await fetch("/api/org-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const hasChanges = orgSettings
    ? orgName !== orgSettings.name ||
      primaryColor !== orgSettings.primaryColor ||
      accentColor !== orgSettings.accentColor
    : false;

  useUnsavedChanges(hasChanges);

  const handleSave = () => {
    updateOrg.mutate({ name: orgName, primaryColor, accentColor });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted" />
          <h3 className="text-lg font-semibold text-foreground">
            Organisation Settings
          </h3>
          {hasChanges && <UnsavedBadge />}
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || updateOrg.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                hasChanges
                  ? "bg-brand text-white hover:bg-brand-hover"
                  : "bg-surface text-muted cursor-not-allowed"
              )}
            >
              {updateOrg.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {orgLoading ? (
        <div className="py-4 text-center text-muted text-sm">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Organisation Name
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              readOnly={!isOwner}
              className={cn(
                "w-full max-w-md px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent",
                !isOwner && "bg-surface/50 cursor-not-allowed"
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Primary Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={!isOwner}
                  className="w-8 h-8 rounded-md border border-border cursor-pointer disabled:cursor-not-allowed p-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setPrimaryColor(val);
                  }}
                  readOnly={!isOwner}
                  className={cn(
                    "w-24 px-2 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand",
                    !isOwner && "bg-surface/50 cursor-not-allowed"
                  )}
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Accent Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  disabled={!isOwner}
                  className="w-8 h-8 rounded-md border border-border cursor-pointer disabled:cursor-not-allowed p-0"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setAccentColor(val);
                  }}
                  readOnly={!isOwner}
                  className={cn(
                    "w-24 px-2 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand",
                    !isOwner && "bg-surface/50 cursor-not-allowed"
                  )}
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted mb-2">Preview</p>
            <div className="flex items-center gap-3">
              <div
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                Primary Button
              </div>
              <div
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: accentColor, color: primaryColor }}
              >
                Accent Button
              </div>
              <div
                className="h-8 w-1.5 rounded-full"
                style={{ backgroundColor: primaryColor }}
              />
              <div
                className="h-8 w-1.5 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ——— Xero Integration ———

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

const revenueCategoryLabels: Record<string, string> = {
  bscRevenue: "BSC Revenue",
  ascRevenue: "ASC Revenue",
  vcRevenue: "VC Revenue",
  otherRevenue: "Other Revenue",
};

const expenseCategoryLabels: Record<string, string> = {
  staffCosts: "Staff Costs",
  foodCosts: "Food Costs",
  suppliesCosts: "Supplies Costs",
  rentCosts: "Rent Costs",
  adminCosts: "Admin Costs",
  otherCosts: "Other Costs",
};

function suggestAccountCategory(
  name: string,
  type: "REVENUE" | "EXPENSE" | string
): string {
  const upper = name.toUpperCase();
  if (upper.includes("BSC") || upper.includes("BEFORE SCHOOL"))
    return "bscRevenue";
  if (upper.includes("ASC") || upper.includes("AFTER SCHOOL"))
    return "ascRevenue";
  if (upper.includes("VACATION") || upper.includes("VC")) return "vcRevenue";
  if (
    upper.includes("STAFF") ||
    upper.includes("WAGE") ||
    upper.includes("SALARY")
  )
    return "staffCosts";
  if (upper.includes("FOOD") || upper.includes("CATERING"))
    return "foodCosts";
  if (upper.includes("SUPPLY") || upper.includes("SUPPLIES"))
    return "suppliesCosts";
  if (upper.includes("RENT") || upper.includes("LEASE")) return "rentCosts";
  if (upper.includes("ADMIN") || upper.includes("OFFICE"))
    return "adminCosts";
  if (type === "REVENUE") return "otherRevenue";
  return "otherCosts";
}

function XeroIntegrationSection({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingStep, setMappingStep] = useState<1 | 2>(1);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Centre mapping local state
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [centreMappings, setCentreMappings] = useState<
    { xeroOptionId: string; serviceId: string }[]
  >([]);

  // Account mapping local state
  const [accountMappings, setAccountMappings] = useState<
    { xeroAccountId: string; category: string }[]
  >([]);

  const { data: status, isLoading: statusLoading } = useXeroStatus();
  const xeroConnect = useXeroConnect();
  const xeroDisconnect = useXeroDisconnect();
  const sync = useXeroSync();
  const saveMappings = useSaveXeroMappings();

  const { data: trackingCategories, isLoading: trackingLoading } =
    useXeroTrackingCategories(showMappingModal);
  const { data: currentMappings } = useXeroMappings(showMappingModal);
  const { data: xeroAccounts, isLoading: accountsLoading } = useXeroAccounts(
    mappingStep === 2
  );

  // Initialize centre mappings from current state when modal opens
  useEffect(() => {
    if (currentMappings?.centreMappings) {
      setCentreMappings(currentMappings.centreMappings);
    }
    if (currentMappings?.trackingCategoryId) {
      setSelectedCategoryId(currentMappings.trackingCategoryId);
    }
    if (currentMappings?.accountMappings) {
      setAccountMappings(currentMappings.accountMappings);
    }
  }, [currentMappings]);

  // Auto-match centre mappings when tracking category changes
  useEffect(() => {
    if (!selectedCategoryId || !trackingCategories || !currentMappings?.services)
      return;
    const category = trackingCategories.find(
      (c: { id: string }) => c.id === selectedCategoryId
    );
    if (!category) return;

    const services = currentMappings.services as {
      id: string;
      name: string;
    }[];
    const newMappings = (
      category.options as { id: string; name: string }[]
    ).map((opt) => {
      const existing = centreMappings.find((m) => m.xeroOptionId === opt.id);
      if (existing?.serviceId) return existing;
      const matched = services.find((s) =>
        opt.name.toUpperCase().includes(s.name.toUpperCase())
      );
      return { xeroOptionId: opt.id, serviceId: matched?.id || "" };
    });
    setCentreMappings(newMappings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, trackingCategories]);

  // Auto-suggest account mappings when accounts load
  useEffect(() => {
    if (!xeroAccounts) return;
    const accounts = xeroAccounts as {
      id: string;
      name: string;
      code: string;
      type: string;
    }[];
    const existing = accountMappings;
    const newMappings = accounts.map((acc) => {
      const ex = existing.find((m) => m.xeroAccountId === acc.id);
      if (ex?.category) return ex;
      return {
        xeroAccountId: acc.id,
        category: suggestAccountCategory(acc.name, acc.type),
      };
    });
    setAccountMappings(newMappings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xeroAccounts]);

  const handleSaveMappings = () => {
    // Transform local state to match API shape
    const accounts = (xeroAccounts || []) as { id: string; code: string; name: string; type: string; Code: string; Name: string; Type: string; Class: string }[];
    const transformedAccountMappings = accountMappings
      .filter((m) => m.category)
      .map((m) => {
        const acc = accounts.find((a) => a.code === m.xeroAccountId || a.Code === m.xeroAccountId);
        return {
          xeroAccountCode: m.xeroAccountId,
          xeroAccountName: acc?.Name || acc?.name || m.xeroAccountId,
          xeroAccountType: acc?.Type || acc?.Class || acc?.type || "EXPENSE",
          localCategory: m.category,
        };
      });

    const transformedCentreMappings = centreMappings
      .filter((m) => m.serviceId)
      .map((m) => ({
        serviceId: m.serviceId,
        xeroTrackingOptionId: m.xeroOptionId,
      }));

    saveMappings.mutate(
      {
        trackingCategoryId: selectedCategoryId,
        centreMappings: transformedCentreMappings,
        accountMappings: transformedAccountMappings,
      },
      {
        onSuccess: () => {
          setShowMappingModal(false);
          setMappingStep(1);
          queryClient.invalidateQueries({ queryKey: ["xero-status"] });
          queryClient.invalidateQueries({ queryKey: ["xero-mappings"] });
        },
      }
    );
  };

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: () => {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 3000);
        queryClient.invalidateQueries({ queryKey: ["xero-status"] });
      },
    });
  };

  const openModal = () => {
    setMappingStep(1);
    setShowMappingModal(true);
  };

  const isConnected = status?.status === "connected";
  const isMapped = isConnected && (status?.mappedCentres ?? 0) > 0;

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-muted" />
            <h3 className="text-lg font-semibold text-foreground">
              Integrations
            </h3>
          </div>
        </div>

        {statusLoading ? (
          <div className="py-4 text-center text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Checking connection...
          </div>
        ) : !isConnected ? (
          /* ——— State 1: Disconnected ——— */
          <div>
            <p className="text-sm text-muted mb-4">
              Connect your Xero account to automatically sync financial data
              across all centres.
            </p>
            <button
              onClick={() => xeroConnect.mutate()}
              disabled={xeroConnect.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#13B5EA] text-white text-sm font-medium rounded-lg hover:bg-[#0fa3d4] transition-colors disabled:opacity-50"
            >
              {xeroConnect.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Connect to Xero
                </>
              )}
            </button>
          </div>
        ) : !isMapped ? (
          /* ——— State 2: Connected but unmapped ——— */
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected to {status?.tenantName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={openModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
              >
                <MapPin className="w-4 h-4" />
                Configure Mappings
              </button>
              <button
                onClick={() => xeroDisconnect.mutate()}
                disabled={xeroDisconnect.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-red-500 text-sm font-medium hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          /* ——— State 3: Connected and mapped ——— */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected to {status?.tenantName}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mb-3 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-muted" />
                {status?.mappedCentres} centres mapped
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-muted" />
                {status?.accountMappings} accounts mapped
              </span>
            </div>

            {/* Last sync info */}
            <div className="flex items-center gap-2 mb-4 text-xs text-muted">
              <RefreshCw className="w-3.5 h-3.5" />
              {status?.lastSyncAt
                ? `Last synced: ${formatRelativeTime(status.lastSyncAt)}`
                : "Never synced"}
              {status?.lastSyncStatus === "error" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                  Sync error
                </span>
              )}
            </div>

            {/* Sync success message */}
            {syncSuccess && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
                <Check className="w-4 h-4" />
                Sync completed successfully
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSync}
                disabled={sync.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                {sync.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sync Now
                  </>
                )}
              </button>
              <button
                onClick={openModal}
                className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground/80 text-sm font-medium rounded-lg hover:bg-surface transition-colors"
              >
                <MapPin className="w-4 h-4" />
                Edit Mappings
              </button>
              <button
                onClick={() => xeroDisconnect.mutate()}
                disabled={xeroDisconnect.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-red-500 text-sm font-medium hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ——— Mapping Modal ——— */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {mappingStep === 1
                    ? "Step 1: Centre Mapping"
                    : "Step 2: Account Mapping"}
                </h3>
                <p className="text-sm text-muted mt-1">
                  {mappingStep === 1
                    ? "Map Xero tracking categories to your services"
                    : "Map Xero accounts to your financial categories"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowMappingModal(false);
                  setMappingStep(1);
                }}
                className="p-1 rounded-md text-muted hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              <span
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  mappingStep === 1
                    ? "bg-brand text-white"
                    : "bg-green-100 text-green-700"
                )}
              >
                {mappingStep > 1 ? (
                  <Check className="w-4 h-4" />
                ) : (
                  "1"
                )}
              </span>
              <div className="flex-1 h-0.5 bg-border">
                <div
                  className={cn(
                    "h-full bg-brand transition-all",
                    mappingStep === 2 ? "w-full" : "w-0"
                  )}
                />
              </div>
              <span
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  mappingStep === 2
                    ? "bg-brand text-white"
                    : "bg-surface text-muted"
                )}
              >
                2
              </span>
            </div>

            {mappingStep === 1 ? (
              /* ——— Step 1: Centre Mapping ——— */
              <div>
                {trackingLoading ? (
                  <div className="py-8 text-center text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading tracking categories...
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-foreground/80 mb-1">
                        Tracking Category
                      </label>
                      <select
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                      >
                        <option value="">Select a tracking category</option>
                        {trackingCategories?.map(
                          (cat: { id: string; name: string }) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {selectedCategoryId && (
                      <div className="space-y-2">
                        {trackingCategories
                          ?.find(
                            (c: { id: string }) =>
                              c.id === selectedCategoryId
                          )
                          ?.options?.map(
                            (opt: { id: string; name: string }) => {
                              const mapping = centreMappings.find(
                                (m) => m.xeroOptionId === opt.id
                              );
                              return (
                                <div
                                  key={opt.id}
                                  className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg bg-surface/50"
                                >
                                  <span className="text-sm font-medium text-foreground/80 flex-shrink-0">
                                    {opt.name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <ArrowRight className="w-4 h-4 text-muted/50" />
                                    <select
                                      value={mapping?.serviceId || ""}
                                      onChange={(e) => {
                                        const newMappings =
                                          centreMappings.filter(
                                            (m) =>
                                              m.xeroOptionId !== opt.id
                                          );
                                        newMappings.push({
                                          xeroOptionId: opt.id,
                                          serviceId: e.target.value,
                                        });
                                        setCentreMappings(newMappings);
                                      }}
                                      className="w-48 px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                                    >
                                      <option value="">Not mapped</option>
                                      {(
                                        currentMappings?.services as {
                                          id: string;
                                          name: string;
                                        }[]
                                      )?.map((svc) => (
                                        <option
                                          key={svc.id}
                                          value={svc.id}
                                        >
                                          {svc.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            }
                          )}
                      </div>
                    )}

                    <div className="flex justify-end mt-6">
                      <button
                        onClick={() => setMappingStep(2)}
                        disabled={!selectedCategoryId}
                        className={cn(
                          "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                          selectedCategoryId
                            ? "bg-brand text-white hover:bg-brand-hover"
                            : "bg-surface text-muted cursor-not-allowed"
                        )}
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ——— Step 2: Account Mapping ——— */
              <div>
                {accountsLoading ? (
                  <div className="py-8 text-center text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading Xero accounts...
                  </div>
                ) : (
                  <>
                    {/* Revenue Accounts */}
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-foreground mb-3">
                        Revenue Accounts
                      </h4>
                      <div className="space-y-2">
                        {(
                          xeroAccounts as {
                            id: string;
                            name: string;
                            code: string;
                            type: string;
                          }[]
                        )
                          ?.filter((a) => a.type === "REVENUE")
                          .map((acc) => {
                            const mapping = accountMappings.find(
                              (m) => m.xeroAccountId === acc.id
                            );
                            return (
                              <div
                                key={acc.id}
                                className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg bg-surface/50"
                              >
                                <span className="text-sm text-foreground/80">
                                  <span className="font-mono text-xs text-muted mr-2">
                                    {acc.code}
                                  </span>
                                  {acc.name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <ArrowRight className="w-4 h-4 text-muted/50" />
                                  <select
                                    value={mapping?.category || ""}
                                    onChange={(e) => {
                                      const newMappings =
                                        accountMappings.filter(
                                          (m) =>
                                            m.xeroAccountId !== acc.id
                                        );
                                      newMappings.push({
                                        xeroAccountId: acc.id,
                                        category: e.target.value,
                                      });
                                      setAccountMappings(newMappings);
                                    }}
                                    className="w-48 px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                                  >
                                    <option value="">Not mapped</option>
                                    {Object.entries(
                                      revenueCategoryLabels
                                    ).map(([key, label]) => (
                                      <option key={key} value={key}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Expense Accounts */}
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-foreground mb-3">
                        Expense Accounts
                      </h4>
                      <div className="space-y-2">
                        {(
                          xeroAccounts as {
                            id: string;
                            name: string;
                            code: string;
                            type: string;
                          }[]
                        )
                          ?.filter((a) => a.type === "EXPENSE")
                          .map((acc) => {
                            const mapping = accountMappings.find(
                              (m) => m.xeroAccountId === acc.id
                            );
                            return (
                              <div
                                key={acc.id}
                                className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg bg-surface/50"
                              >
                                <span className="text-sm text-foreground/80">
                                  <span className="font-mono text-xs text-muted mr-2">
                                    {acc.code}
                                  </span>
                                  {acc.name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <ArrowRight className="w-4 h-4 text-muted/50" />
                                  <select
                                    value={mapping?.category || ""}
                                    onChange={(e) => {
                                      const newMappings =
                                        accountMappings.filter(
                                          (m) =>
                                            m.xeroAccountId !== acc.id
                                        );
                                      newMappings.push({
                                        xeroAccountId: acc.id,
                                        category: e.target.value,
                                      });
                                      setAccountMappings(newMappings);
                                    }}
                                    className="w-48 px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                                  >
                                    <option value="">Not mapped</option>
                                    {Object.entries(
                                      expenseCategoryLabels
                                    ).map(([key, label]) => (
                                      <option key={key} value={key}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center justify-between mt-6">
                      <button
                        onClick={() => setMappingStep(1)}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground/80 text-sm font-medium rounded-lg hover:bg-surface transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </button>
                      <button
                        onClick={handleSaveMappings}
                        disabled={saveMappings.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
                      >
                        {saveMappings.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Save Mappings
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ——— Permissions Overview (owner only) ———

function PermissionsPanel() {
  // Group rows by section
  const sections: { name: string; rows: PermissionRow[] }[] = [];
  let currentSection = "";
  for (const row of permissionsTable) {
    if (row.section !== currentSection) {
      currentSection = row.section;
      sections.push({ name: currentSection, rows: [] });
    }
    sections[sections.length - 1].rows.push(row);
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="w-5 h-5 text-muted" />
        <h3 className="text-lg font-semibold text-foreground">
          Role Permissions
        </h3>
      </div>
      <p className="text-sm text-muted mb-5">
        An overview of what each role can access. Custom per-user permissions are
        not supported yet — all users of a role share the same access level.
      </p>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm min-w-[580px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">
                Permission
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.owner}
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.head_office}
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.admin}
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.marketing}
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.coordinator}
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.member}
              </th>
              <th className="text-center text-xs font-medium text-muted uppercase tracking-wider py-2 px-3 w-20 sm:w-24">
                {ROLE_DISPLAY_NAMES.staff}
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={`section-${section.name}`}>
                <tr>
                  <td
                    colSpan={8}
                    className="pt-4 pb-1 px-3 text-xs font-semibold text-muted uppercase tracking-wider"
                  >
                    {section.name}
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-gray-50 hover:bg-surface/50"
                  >
                    <td className="py-2 px-3 text-sm text-foreground/80">
                      {row.label}
                    </td>
                    {(["owner", "head_office", "admin", "marketing", "coordinator", "member", "staff"] as const).map((role) => (
                      <td key={role} className="py-2 px-3 text-center">
                        {row[role] ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted/50 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Keys management (owner only)
// ---------------------------------------------------------------------------

const SCOPE_LABELS: Record<string, string> = {
  "programs:write": "Programs (write)",
  "programs:read": "Programs (read)",
  "menus:write": "Menus (write)",
  "menus:read": "Menus (read)",
  "announcements:write": "Announcements (write)",
  "announcements:read": "Announcements (read)",
    "marketing:write": "Marketing (write)",
    "marketing:read": "Marketing (read)",
    "marketing-tasks:write": "Marketing Tasks (write)",
    "marketing-tasks:read": "Marketing Tasks (read)",
    "marketing-campaigns:write": "Marketing Campaigns (write)",
    "marketing-campaigns:read": "Marketing Campaigns (read)",
    "enquiries:write": "Enquiries (write)",
    "enquiries:read": "Enquiries (read)",
    "recruitment:write": "Recruitment (write)",
    "recruitment:read": "Recruitment (read)",
    "attendance:read": "Attendance / Occupancy (read)",
    "pipeline:read": "Pipeline Stats (read)",
    "hr:read": "HR / People (read)",
    "billing:read": "Billing / Overdue Fees (read)",
    "billing:write": "Billing / Overdue Fees (write)",
    "financials:read": "Finance / P&L (read)",
    "operations:read": "Operations / QIP / Incidents (read)",
    "operations:write": "Operations / QIP / Incidents (write)",
    "parent-experience:read": "Parent Experience (read)",
    "parent-experience:write": "Parent Experience (write)",
    "partnerships:read": "Partnerships (read)",
    "partnerships:write": "Partnerships (write)",
    "staff:sync": "Staff Registry Sync",
};

const WRITE_SCOPES = ["programs:write", "menus:write", "announcements:write", "marketing:write", "enquiries:write", "recruitment:write", "billing:write", "operations:write"] as const;

function ApiKeysSection() {
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [showCreate, setShowCreate] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [revealKey, setRevealKey] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  // Create form state
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>([]);
  const [keyExpiry, setKeyExpiry] = useState("");
  const [createError, setCreateError] = useState("");

  function resetCreateForm() {
    setKeyName("");
    setKeyScopes([]);
    setKeyExpiry("");
    setCreateError("");
    setShowCreate(false);
  }

  async function handleCreate() {
    if (!keyName.trim()) {
      setCreateError("Name is required");
      return;
    }
    if (keyScopes.length === 0) {
      setCreateError("Select at least one scope");
      return;
    }
    setCreateError("");

    try {
      const result = await createKey.mutateAsync({
        name: keyName.trim(),
        scopes: keyScopes,
        expiresAt: keyExpiry ? new Date(keyExpiry).toISOString() : undefined,
      });
      setRevealKey(result.plaintext);
      setShowReveal(true);
      resetCreateForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create key");
    }
  }

  function handleRevoke(id: string) {
    revokeKey.mutate(id, {
      onSuccess: () => setConfirmRevoke(null),
    });
  }

  function toggleScope(scope: string) {
    setKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch((err) => {
      if (process.env.NODE_ENV !== "production") console.warn("Clipboard copy failed:", err);
    });
  }

  function getKeyStatus(key: { revokedAt: string | null; expiresAt: string | null }) {
    if (key.revokedAt) return { label: "Revoked", color: "bg-red-100 text-red-700" };
    if (key.expiresAt && new Date(key.expiresAt) < new Date())
      return { label: "Expired", color: "bg-yellow-100 text-yellow-700" };
    return { label: "Active", color: "bg-emerald-100 text-emerald-700" };
  }

  function formatDate(d: string | null) {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-muted" />
          <h3 className="text-lg font-semibold text-foreground">API Keys</h3>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: "#003344" }}
        >
          Create Key
        </button>
      </div>

      <p className="text-sm text-muted mb-4">
        API keys allow external systems (e.g. Cowork) to push data into the dashboard.
        Keys are hashed and cannot be viewed after creation.
      </p>

      {isLoading ? (
        <div className="py-8 text-center text-muted">Loading API keys...</div>
      ) : !keys?.length ? (
        <EmptyState icon={Key} title="No API Keys" description="No API keys created yet. Create a key to allow external systems to push data." variant="inline" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Name</th>
                <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Key</th>
                <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Scopes</th>
                <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Last Used</th>
                <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">Status</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const status = getKeyStatus(key);
                return (
                  <tr key={key.id} className="border-b border-border/50">
                    <td className="py-3 px-3">
                      <div className="text-sm font-medium text-foreground">{key.name}</div>
                      <div className="text-xs text-muted">
                        by {key.createdBy?.name ?? "Unknown"} &middot; {formatDate(key.createdAt)}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-xs bg-surface px-2 py-1 rounded font-mono text-muted">
                        {key.keyPrefix}...
                      </code>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700"
                          >
                            {scope.replace(":", " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm text-muted">
                      {formatDate(key.lastUsedAt)}
                    </td>
                    <td className="py-3 px-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", status.color)}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!key.revokedAt && (
                        confirmRevoke === key.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRevoke(key.id)}
                              className="text-xs text-red-600 font-medium hover:text-red-800"
                              disabled={revokeKey.isPending}
                            >
                              {revokeKey.isPending ? "..." : "Confirm"}
                            </button>
                            <button
                              onClick={() => setConfirmRevoke(null)}
                              className="text-xs text-muted hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRevoke(key.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Revoke
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Key Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-foreground">Create API Key</h4>
              <button onClick={resetCreateForm} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Name</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Cowork Production"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">Scopes</label>
                <div className="space-y-2">
                  {WRITE_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={keyScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="rounded border-border text-brand-dark focus:ring-brand-dark"
                      />
                      <span className="text-sm text-foreground/80">{SCOPE_LABELS[scope] || scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Expiry <span className="text-muted">(optional)</span>
                </label>
                <input
                  type="date"
                  value={keyExpiry}
                  onChange={(e) => setKeyExpiry(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-dark focus:border-transparent"
                />
              </div>

              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={resetCreateForm}
                className="px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createKey.isPending}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#003344" }}
              >
                {createKey.isPending ? "Creating..." : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Reveal Modal — shown ONCE after creation */}
      {showReveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h4 className="text-lg font-semibold text-foreground">API Key Created</h4>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800 font-medium">
                Copy this key now. It will not be shown again.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <code className="flex-1 bg-surface rounded-lg px-4 py-3 text-sm font-mono text-foreground break-all select-all">
                {revealKey}
              </code>
              <button
                onClick={() => copyToClipboard(revealKey)}
                className="flex-shrink-0 p-2 text-muted hover:text-foreground hover:bg-surface rounded-lg"
                title="Copy to clipboard"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowReveal(false);
                  setRevealKey("");
                }}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: "#003344" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OWNA Integration Section
// ---------------------------------------------------------------------------

function OwnaIntegrationSection() {
  const { data: status, isLoading } = useOwnaStatus();
  const updateMapping = useUpdateOwnaMapping();
  const sync = useOwnaSync();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSave = (serviceId: string) => {
    updateMapping.mutate(
      { serviceId, ownaServiceId: editValue.trim() || null },
      {
        onSuccess: () => setEditingId(null),
      },
    );
  };

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: () => {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 3000);
      },
    });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CloudCog className="w-5 h-5 text-muted" />
          <h3 className="text-lg font-semibold text-foreground">
            OWNA Integration
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {status?.configured ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              API Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Not Configured
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          Loading OWNA status...
        </div>
      ) : !status?.configured ? (
        <div>
          <p className="text-sm text-muted mb-2">
            Set the <code className="text-xs bg-surface px-1.5 py-0.5 rounded">OWNA_API_URL</code> and{" "}
            <code className="text-xs bg-surface px-1.5 py-0.5 rounded">OWNA_API_KEY</code> environment
            variables to enable automatic attendance and booking sync from OWNA.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Map each service to its OWNA Service ID to enable automatic
            attendance, booking, and roster sync every 30 minutes during
            operating hours.
          </p>

          {/* Service mapping table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">
                    Service
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">
                    OWNA Service ID
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-3">
                    Last Synced
                  </th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {status.services.map((svc) => (
                  <tr
                    key={svc.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2.5 px-3">
                      <div className="text-sm font-medium text-foreground">
                        {svc.name}
                      </div>
                      <div className="text-xs text-muted">{svc.code}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {editingId === svc.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="e.g. SVC-001"
                            className="w-40 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSave(svc.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSave(svc.id)}
                            disabled={updateMapping.isPending}
                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            {updateMapping.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 text-muted hover:text-foreground"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-sm ${svc.ownaServiceId ? "text-foreground font-mono" : "text-muted italic"}`}
                        >
                          {svc.ownaServiceId || "Not mapped"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs text-muted">
                        {svc.ownaSyncedAt
                          ? new Date(svc.ownaSyncedAt).toLocaleString("en-AU", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {editingId !== svc.id && (
                        <button
                          onClick={() => {
                            setEditingId(svc.id);
                            setEditValue(svc.ownaServiceId || "");
                          }}
                          className="text-xs text-brand hover:text-brand-hover font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sync button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSync}
              disabled={sync.isPending || status.mappedCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {sync.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync Now
                </>
              )}
            </button>
            {syncSuccess && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                Sync completed
              </span>
            )}
            {sync.isError && (
              <span className="inline-flex items-center gap-1 text-sm text-red-500">
                <XCircle className="w-4 h-4" />
                {sync.error?.message || "Sync failed"}
              </span>
            )}
            {status.mappedCount === 0 && (
              <span className="text-xs text-muted">
                Map at least one service to enable sync
              </span>
            )}
          </div>

          <p className="text-xs text-muted">
            {status.mappedCount} of {status.totalServices} services mapped.
            Auto-sync runs every 30 minutes during operating hours (6am–7pm
            AEST, Mon–Fri).
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Centre Purchase Budget Tiers (owner/head_office)
// ---------------------------------------------------------------------------

interface BudgetTier {
  minWeeklyChildren: number;
  monthlyBudget: number;
}

function BudgetTiersSection() {
  const queryClient = useQueryClient();
  const [tiers, setTiers] = useState<BudgetTier[]>([]);
  const [newMin, setNewMin] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: orgSettings, isLoading } = useQuery<{ purchaseBudgetTiers?: BudgetTier[] }>({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch("/api/org-settings");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  useEffect(() => {
    if (orgSettings?.purchaseBudgetTiers) {
      setTiers(orgSettings.purchaseBudgetTiers);
    } else if (!isLoading) {
      setTiers([
        { minWeeklyChildren: 100, monthlyBudget: 300 },
        { minWeeklyChildren: 0, monthlyBudget: 150 },
      ]);
    }
  }, [orgSettings, isLoading]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sorted = [...tiers].sort((a, b) => b.minWeeklyChildren - a.minWeeklyChildren);
      const res = await fetch("/api/org-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseBudgetTiers: sorted }),
      });
      if (!res.ok) throw new Error("Save failed");
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
      toast({ description: "Budget tiers saved" });
    } catch {
      toast({ description: "Failed to save tiers", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addTier = () => {
    const min = parseInt(newMin) || 0;
    const budget = parseFloat(newBudget);
    if (isNaN(budget) || budget <= 0) return;
    setTiers((prev) =>
      [...prev, { minWeeklyChildren: min, monthlyBudget: budget }].sort(
        (a, b) => b.minWeeklyChildren - a.minWeeklyChildren
      )
    );
    setNewMin("");
    setNewBudget("");
  };

  const removeTier = (idx: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-5 h-5 text-muted" />
        <h3 className="text-lg font-semibold text-foreground">
          Centre Purchase Budget Tiers
        </h3>
      </div>
      <p className="text-sm text-muted mb-4">
        Set monthly budget allocations based on average weekly attendance.
        Services are matched to the first tier where their weekly attendance meets the minimum.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-10 bg-surface rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="text-left text-muted border-b border-border/50">
                <th className="pb-2 font-medium">Min Weekly Children</th>
                <th className="pb-2 font-medium">Monthly Budget ($)</th>
                <th className="pb-2 font-medium w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tiers.map((tier, idx) => (
                <tr key={idx}>
                  <td className="py-2 text-foreground">{tier.minWeeklyChildren}+</td>
                  <td className="py-2 text-foreground font-medium">${tier.monthlyBudget}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => removeTier(idx)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Add tier row */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="number"
              value={newMin}
              onChange={(e) => setNewMin(e.target.value)}
              placeholder="Min children"
              min={0}
              className="w-32 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              type="number"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              placeholder="Budget ($)"
              min={0}
              step="0.01"
              className="w-32 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              onClick={addTier}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface text-foreground/80 hover:bg-border transition-colors"
            >
              Add Tier
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Tiers
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Usage Dashboard
// ---------------------------------------------------------------------------

interface AiUsageData {
  totalCalls: number;
  totalInput: number;
  totalOutput: number;
  estimatedCost: number;
  bySection: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
  byUser: Record<string, { name: string; calls: number; inputTokens: number; outputTokens: number }>;
  byTemplate: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
  byDay: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
  days: number;
}

const SECTION_COLORS: Record<string, string> = {
  marketing: "bg-pink-500",
  compliance: "bg-blue-500",
  recruitment: "bg-amber-500",
  operations: "bg-emerald-500",
  engagement: "bg-purple-500",
  strategy: "bg-indigo-500",
  assistant: "bg-surface/500",
  sentiment: "bg-rose-500",
  attendance: "bg-teal-500",
  duplicates: "bg-orange-500",
  unknown: "bg-gray-400",
};

function AiUsageDashboard() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<AiUsageData>({
    queryKey: ["ai-usage", days],
    queryFn: async () => {
      const res = await fetch(`/api/ai/usage?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch AI usage");
      return res.json();
    },
  });

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const sectionEntries = data ? Object.entries(data.bySection).sort((a, b) => b[1].calls - a[1].calls) : [];
  const userEntries = data ? Object.entries(data.byUser).sort((a, b) => b[1].calls - a[1].calls) : [];
  const templateEntries = data ? Object.entries(data.byTemplate).sort((a, b) => b[1].calls - a[1].calls).slice(0, 10) : [];
  const maxSectionCalls = sectionEntries.length > 0 ? sectionEntries[0][1].calls : 1;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-foreground">AI Usage</h3>
        </div>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                days === d
                  ? "bg-purple-100 text-purple-700"
                  : "text-muted hover:bg-surface"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          Loading AI usage data...
        </div>
      ) : !data || data.totalCalls === 0 ? (
        <p className="text-sm text-muted py-4 text-center">No AI usage in this period.</p>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-purple-600 mb-1">
                <Zap className="w-3.5 h-3.5" /> Calls
              </div>
              <p className="text-xl font-bold text-purple-900">{data.totalCalls}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-1">
                <BarChart3 className="w-3.5 h-3.5" /> Input Tokens
              </div>
              <p className="text-xl font-bold text-blue-900">{formatTokens(data.totalInput)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-1">
                <BarChart3 className="w-3.5 h-3.5" /> Output Tokens
              </div>
              <p className="text-xl font-bold text-emerald-900">{formatTokens(data.totalOutput)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-1">
                <DollarSign className="w-3.5 h-3.5" /> Est. Cost
              </div>
              <p className="text-xl font-bold text-amber-900">${data.estimatedCost.toFixed(2)}</p>
            </div>
          </div>

          {/* By Section */}
          <div>
            <h4 className="text-sm font-medium text-foreground/80 mb-2">Usage by Section</h4>
            <div className="space-y-2">
              {sectionEntries.map(([section, stats]) => (
                <div key={section} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-24 capitalize truncate">{section}</span>
                  <div className="flex-1 bg-surface rounded-full h-5 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", SECTION_COLORS[section] || "bg-gray-400")}
                      style={{ width: `${(stats.calls / maxSectionCalls) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground/80 w-12 text-right">{stats.calls}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By User */}
          <div>
            <h4 className="text-sm font-medium text-foreground/80 mb-2">Usage by User</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-xs font-medium text-muted py-1.5">User</th>
                    <th className="text-right text-xs font-medium text-muted py-1.5">Calls</th>
                    <th className="text-right text-xs font-medium text-muted py-1.5">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {userEntries.map(([uid, stats]) => (
                    <tr key={uid} className="border-b border-gray-50">
                      <td className="py-1.5 text-foreground/80">{stats.name}</td>
                      <td className="py-1.5 text-right text-muted">{stats.calls}</td>
                      <td className="py-1.5 text-right text-muted text-xs">
                        {formatTokens(stats.inputTokens + stats.outputTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Templates */}
          {templateEntries.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-foreground/80 mb-2">Top Templates</h4>
              <div className="space-y-1.5">
                {templateEntries.map(([slug, stats]) => (
                  <div key={slug} className="flex items-center justify-between text-xs">
                    <span className="text-muted font-mono truncate max-w-[60%]">{slug}</span>
                    <span className="text-muted">
                      {stats.calls} calls &middot; {formatTokens(stats.inputTokens + stats.outputTokens)} tokens
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SettingsContent({ userRole }: { userRole: Role }) {
  const [showInvite, setShowInvite] = useState(false);
  const [showBulkInvite, setShowBulkInvite] = useState(false);
  const [showImportStaff, setShowImportStaff] = useState(false);
  const isOwner = userRole === "owner";
  const isHeadOffice = userRole === "head_office";
  const canManageUsers = isOwner || isHeadOffice;
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: canManageUsers,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHeader title="Settings" description="Organisation settings, integrations, and user management" />

      {/* Organisation Settings (owner only) */}
      {isOwner && <OrgSettingsSection isOwner={isOwner} />}

      {/* System Banners (owner/head_office) */}
      {(isOwner || isHeadOffice) && <BannerManagementSection />}

      {/* Xero Integration (owner only) */}
      {isOwner && (
        <XeroIntegrationSection isOwner={isOwner} />
      )}

      {/* OWNA Integration (owner/admin) */}
      {(userRole === "owner" || userRole === "admin") && (
        <OwnaIntegrationSection />
      )}

      {/* API Keys (owner only) */}
      {isOwner && <ApiKeysSection />}

      {/* Budget Tiers (owner/head_office) */}
      {isOwner && <BudgetTiersSection />}

      {/* Seed Template Data (owner/admin) */}
      {(userRole === "owner" || userRole === "admin") && (
        <Link
          href="/settings/seed"
          className="flex items-center gap-4 bg-card rounded-xl border border-border p-6 hover:border-brand/40 hover:shadow-sm transition-all group"
        >
          <div className="p-2.5 rounded-lg bg-brand/10 text-brand shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
              Seed Template Data
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Populate default templates, policies, checklists, and guides. Safe to run multiple times.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted group-hover:text-brand ml-auto shrink-0 transition-colors" />
        </Link>
      )}

      {/* User Management (owner + head_office) */}
      {canManageUsers && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted" />
              <h3 className="text-lg font-semibold text-foreground">
                User Management
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && (
                <button
                  onClick={() => setShowImportStaff(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground/80 hover:bg-surface transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Import Staff
                </button>
              )}
              <button
                onClick={() => setShowBulkInvite(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground/80 hover:bg-surface transition-colors"
              >
                <Users className="w-4 h-4" />
                Bulk Invite
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Invite User
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted">Loading users...</div>
          ) : (
            <div className="overflow-visible">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-4">
                      User
                    </th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-4">
                      Role
                    </th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-4">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider py-2 px-4">
                      Joined
                    </th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((user) => (
                    <UserRow key={user.id} user={user} isOwner={isOwner} canManageUsers={canManageUsers} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <InviteUserModal
            open={showInvite}
            onClose={() => setShowInvite(false)}
            currentUserRole={userRole}
          />

          <BulkInviteModal
            open={showBulkInvite}
            onClose={() => setShowBulkInvite(false)}
            currentUserRole={userRole}
          />

          {showImportStaff && (
            <ImportWizard
              title="Import Staff from Spreadsheet"
              endpoint="/api/users/import"
              columnConfig={[
                { key: "name", label: "Name", required: true },
                { key: "email", label: "Email", required: true },
                { key: "role", label: "Role (owner/admin/member/staff)" },
                { key: "service", label: "Service / Centre" },
              ]}
              onComplete={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
              onClose={() => setShowImportStaff(false)}
            />
          )}
        </div>
      )}

      {!canManageUsers && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-muted" />
            <h3 className="text-lg font-semibold text-foreground">
              User Management
            </h3>
          </div>
          <p className="text-sm text-muted">
            Only owners and head office users can manage users. Contact your organisation owner to
            invite new team members or change roles.
          </p>
        </div>
      )}

      {/* AI Usage Dashboard (owner/head_office) */}
      {(isOwner || isHeadOffice) && <AiUsageDashboard />}

      {/* Adoption Metrics (owner/admin/head_office) */}
      {(isOwner || isHeadOffice || userRole === "admin") && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-muted" />
            <h3 className="text-lg font-semibold text-foreground">
              Adoption Metrics
            </h3>
          </div>
          <AdoptionDashboard />
        </div>
      )}

      {/* Activity Log (owner/head_office/admin) */}
      {(userRole === "owner" || userRole === "head_office" || userRole === "admin") && <ActivityLogPanel />}

      {/* Permissions overview (owner only) */}
      {isOwner && <PermissionsPanel />}

      {/* Notification Log (coordinator+) */}
      {(userRole === "owner" || userRole === "head_office" || userRole === "admin" || userRole === "coordinator") && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-muted" />
            <h3 className="text-lg font-semibold text-foreground">
              Notification Log
            </h3>
          </div>
          <NotificationLogTab />
        </div>
      )}
    </div>
  );
}
