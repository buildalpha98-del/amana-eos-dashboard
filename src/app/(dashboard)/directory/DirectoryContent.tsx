"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  LayoutGrid,
  List,
  Mail,
  Phone,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  avatar: string | null;
  serviceId: string | null;
  service: { name: string; code: string } | null;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const roleNames: Record<string, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  coordinator: "Service Coordinator",
  member: "Centre Director",
  staff: "Educator",
};

const roleBadgeColors: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700",
  head_office: "bg-blue-100 text-blue-700",
  admin: "bg-indigo-100 text-indigo-700",
  marketing: "bg-pink-100 text-pink-700",
  coordinator: "bg-amber-100 text-amber-700",
  member: "bg-emerald-100 text-emerald-700",
  staff: "bg-gray-100 text-gray-700",
};

const roleOptions = Object.entries(roleNames).map(([value, label]) => ({
  value,
  label,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DirectoryContent() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Fetch directory
  const { data: users, isLoading } = useQuery<DirectoryUser[]>({
    queryKey: ["directory", search, roleFilter, serviceFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (serviceFilter) params.set("serviceId", serviceFilter);
      const res = await fetch(`/api/directory?${params}`);
      if (!res.ok) throw new Error("Failed to fetch directory");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Fetch services for filter dropdown
  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Fetch all users (unfiltered) for total count
  const { data: allUsers } = useQuery<DirectoryUser[]>({
    queryKey: ["directory"],
    queryFn: async () => {
      const res = await fetch("/api/directory");
      if (!res.ok) throw new Error("Failed to fetch directory");
      return res.json();
    },
    staleTime: 60_000,
  });

  const totalCount = allUsers?.length ?? 0;
  const shownCount = users?.length ?? 0;
  const hasFilters = !!(search || roleFilter || serviceFilter);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
          Staff Directory
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Find and connect with your team
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            aria-label="Search staff directory"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="">All Roles</option>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {/* Centre filter */}
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="">All Centres</option>
          {services?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-start">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-2 rounded-md transition-colors",
              viewMode === "grid"
                ? "bg-white text-brand shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            )}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-2 rounded-md transition-colors",
              viewMode === "list"
                ? "bg-white text-brand shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            )}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="text-sm text-gray-500">
        {isLoading
          ? "Loading..."
          : hasFilters
            ? `Showing ${shownCount} of ${totalCount} team members`
            : `Showing ${totalCount} team members`}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-brand rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && users && users.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            No team members found matching your search
          </p>
        </div>
      )}

      {/* Grid view */}
      {!isLoading && users && users.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow"
            >
              {/* Avatar */}
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover mb-3"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-brand/10 text-brand flex items-center justify-center text-lg font-semibold mb-3">
                  {getInitials(user.name)}
                </div>
              )}

              {/* Name */}
              <p className="font-semibold text-gray-900 truncate w-full">
                {user.name}
              </p>

              {/* Role badge */}
              <span
                className={cn(
                  "inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
                  roleBadgeColors[user.role] ?? "bg-gray-100 text-gray-700"
                )}
              >
                {roleNames[user.role] ?? user.role}
              </span>

              {/* Centre */}
              {user.service && (
                <p className="text-xs text-gray-500 mt-1.5 truncate w-full">
                  {user.service.name}
                </p>
              )}

              {/* Contact */}
              <div className="mt-3 flex flex-col gap-1.5 w-full">
                <a
                  href={`mailto:${user.email}`}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand transition-colors justify-center truncate"
                >
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{user.email}</span>
                </a>
                {user.phone && (
                  <a
                    href={`tel:${user.phone}`}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand transition-colors justify-center"
                  >
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {user.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && users && users.length > 0 && viewMode === "list" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">
                    Centre
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">
                    Phone
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    {/* Name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {getInitials(user.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {user.name}
                          </p>
                          {/* Show role on mobile */}
                          <span
                            className={cn(
                              "inline-block sm:hidden mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium",
                              roleBadgeColors[user.role] ??
                                "bg-gray-100 text-gray-700"
                            )}
                          >
                            {roleNames[user.role] ?? user.role}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className={cn(
                          "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium",
                          roleBadgeColors[user.role] ??
                            "bg-gray-100 text-gray-700"
                        )}
                      >
                        {roleNames[user.role] ?? user.role}
                      </span>
                    </td>

                    {/* Centre */}
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {user.service?.name ?? "\u2014"}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <a
                        href={`mailto:${user.email}`}
                        className="text-gray-500 hover:text-brand transition-colors"
                      >
                        {user.email}
                      </a>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {user.phone ? (
                        <a
                          href={`tel:${user.phone}`}
                          className="text-gray-500 hover:text-brand transition-colors"
                        >
                          {user.phone}
                        </a>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
