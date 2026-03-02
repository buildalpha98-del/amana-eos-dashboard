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
} from "lucide-react";
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
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
              className="flex-1 px-4 py-2 bg-[#1B4D3E] text-white font-medium rounded-lg hover:bg-[#164032] transition-colors disabled:opacity-50"
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
      return <Shield className="w-4 h-4 text-[#1B4D3E]" />;
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
          <div className="w-8 h-8 rounded-full bg-[#1B4D3E]/10 flex items-center justify-center text-xs font-medium text-[#1B4D3E]">
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
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">
            Organisation Settings
          </h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organisation Name
            </label>
            <input
              type="text"
              defaultValue="Amana OSHC"
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              readOnly
            />
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Colour
              </label>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-[#1B4D3E] border border-gray-200" />
                <span className="text-sm text-gray-500">#1B4D3E</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Accent Colour
              </label>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-[#FECE00] border border-gray-200" />
                <span className="text-sm text-gray-500">#FECE00</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4D3E] text-white text-sm font-medium rounded-lg hover:bg-[#164032] transition-colors"
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
    </div>
  );
}
