"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Users,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState("");

  const createUser = useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      password: string;
      role: Role;
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            Invite Team Member
          </h3>
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate({ name, email, password, role });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="john@amanaoshc.com.au"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temporary Password
            </label>
            <input
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="Set a temporary password"
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>

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
              disabled={createUser.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
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
      return <ShieldCheck className="w-4 h-4 text-[#FECE00]" />;
    case "admin":
      return <Shield className="w-4 h-4 text-[#004E64]" />;
    default:
      return <User className="w-4 h-4 text-gray-400" />;
  }
}

function UserRow({
  user,
  isOwner,
}: {
  user: UserData;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);

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
  });

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#004E64]/10 flex items-center justify-center text-xs font-medium text-[#004E64]">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize">
          <RoleIcon role={user.role} />
          {user.role}
        </span>
      </td>
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            user.active
              ? "bg-green-50 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {user.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="py-3 px-4 text-xs text-gray-500">
        {new Date(user.createdAt).toLocaleDateString("en-AU")}
      </td>
      <td className="py-3 px-4">
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    onClick={() => updateRole.mutate("member")}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Set as Member
                  </button>
                  <button
                    onClick={() => updateRole.mutate("admin")}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Set as Admin
                  </button>
                  <button
                    onClick={() => updateRole.mutate("owner")}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Set as Owner
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => toggleActive.mutate()}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    {user.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </>
            )}
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
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
          {data && (
            <span className="text-xs text-gray-400">
              {data.total} entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
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
        <div className="py-8 text-center text-gray-500">Loading activity...</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No activity recorded yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-3">When</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-3">User</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-3">Action</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-3">Details</th>
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
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString("en-AU", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-sm font-medium text-gray-900">
                          {log.user.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                            actionBadge[log.action] || "bg-gray-100 text-gray-600"
                          )}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">
                        {log.entityType}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-500 max-w-xs truncate">
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
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30"
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
  useState(() => {
    if (orgSettings) {
      setOrgName(orgSettings.name);
      setPrimaryColor(orgSettings.primaryColor);
      setAccentColor(orgSettings.accentColor);
    }
  });

  // Update local state when query data changes
  const [initialized, setInitialized] = useState(false);
  if (orgSettings && !initialized) {
    setOrgName(orgSettings.name);
    setPrimaryColor(orgSettings.primaryColor);
    setAccentColor(orgSettings.accentColor);
    setInitialized(true);
  }

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
  });

  const hasChanges = orgSettings
    ? orgName !== orgSettings.name ||
      primaryColor !== orgSettings.primaryColor ||
      accentColor !== orgSettings.accentColor
    : false;

  const handleSave = () => {
    updateOrg.mutate({ name: orgName, primaryColor, accentColor });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">
            Organisation Settings
          </h3>
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
                  ? "bg-[#004E64] text-white hover:bg-[#003D52]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              {updateOrg.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {orgLoading ? (
        <div className="py-4 text-center text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organisation Name
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              readOnly={!isOwner}
              className={cn(
                "w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent",
                !isOwner && "bg-gray-50 cursor-not-allowed"
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={!isOwner}
                  className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer disabled:cursor-not-allowed p-0"
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
                    "w-24 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]",
                    !isOwner && "bg-gray-50 cursor-not-allowed"
                  )}
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Accent Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  disabled={!isOwner}
                  className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer disabled:cursor-not-allowed p-0"
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
                    "w-24 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]",
                    !isOwner && "bg-gray-50 cursor-not-allowed"
                  )}
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Preview</p>
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

export function SettingsContent({ userRole }: { userRole: Role }) {
  const [showInvite, setShowInvite] = useState(false);
  const isOwner = userRole === "owner";

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: isOwner,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Organisation Settings */}
      <OrgSettingsSection isOwner={isOwner} />

      {/* User Management (owner only) */}
      {isOwner && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">
                User Management
              </h3>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Invite User
            </button>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-gray-500">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                      User
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                      Role
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                      Joined
                    </th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((user) => (
                    <UserRow key={user.id} user={user} isOwner={isOwner} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <InviteUserModal
            open={showInvite}
            onClose={() => setShowInvite(false)}
          />
        </div>
      )}

      {!isOwner && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">
              User Management
            </h3>
          </div>
          <p className="text-sm text-gray-500">
            Only owners can manage users. Contact your organisation owner to
            invite new team members or change roles.
          </p>
        </div>
      )}

      {/* Activity Log (owner/admin) */}
      {(userRole === "owner" || userRole === "admin") && <ActivityLogPanel />}
    </div>
  );
}
