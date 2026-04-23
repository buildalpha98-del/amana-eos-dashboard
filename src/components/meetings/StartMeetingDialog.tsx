"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Search,
  Building2,
  X,
  Users,
} from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { cn } from "@/lib/utils";
import { fetchApi } from "@/lib/fetch-api";

export function StartMeetingDialog({
  onStart,
  onCancel,
  isPending,
}: {
  onStart: (serviceIds: string[], attendeeIds: string[]) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { data: services } = useServices("active");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [step, setStep] = useState<"services" | "attendees">("services");
  const [userSearch, setUserSearch] = useState("");

  const { data: allUsers } = useQuery<{ id: string; name: string; email: string; role: string; serviceId?: string | null }[]>({
    queryKey: ["users-list-full"],
    queryFn: () => fetchApi<{ id: string; name: string; email: string; role: string; serviceId?: string | null }[]>("/api/users"),
    retry: 2,
    staleTime: 60_000,
  });

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (services) setSelectedServiceIds(services.map((s) => s.id));
  };

  const clearAll = () => setSelectedServiceIds([]);

  // Filter users based on selected services and search
  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    let users = allUsers;
    if (selectedServiceIds.length > 0) {
      users = users.filter(
        (u) => !u.serviceId || selectedServiceIds.includes(u.serviceId)
      );
    }
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }
    return users;
  }, [allUsers, selectedServiceIds, userSearch]);

  // Auto-select users from selected services
  const autoSelectServiceUsers = useCallback(() => {
    if (!allUsers || selectedServiceIds.length === 0) return;
    const serviceUserIds = allUsers
      .filter((u) => u.serviceId && selectedServiceIds.includes(u.serviceId))
      .map((u) => u.id);
    setSelectedUserIds((prev) => {
      const combined = new Set([...prev, ...serviceUserIds]);
      return [...combined];
    });
  }, [allUsers, selectedServiceIds]);

  const handleNextStep = () => {
    autoSelectServiceUsers();
    setStep("attendees");
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-50"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Start L10 Meeting
              </h3>
              <p className="text-xs text-muted mt-0.5">
                {step === "services"
                  ? "Select which services to include in this meeting"
                  : "Select attendees for this meeting"}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="p-1 text-muted hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {step === "services" ? (
            <>
              <div className="p-6 space-y-4">
                {/* Quick Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onStart([], [])}
                    className="text-xs px-3 py-1.5 border border-brand text-brand rounded-lg hover:bg-brand/5 transition-colors font-medium"
                  >
                    Company-Wide Meeting
                  </button>
                  <button
                    onClick={selectAll}
                    className="text-xs px-3 py-1.5 text-muted hover:text-foreground transition-colors"
                  >
                    Select All
                  </button>
                  {selectedServiceIds.length > 0 && (
                    <button
                      onClick={clearAll}
                      className="text-xs px-3 py-1.5 text-muted hover:text-foreground transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Services Grid */}
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {services?.map((service) => {
                    const selected = selectedServiceIds.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        onClick={() => toggleService(service.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                          selected
                            ? "border-brand bg-brand/5"
                            : "border-border hover:border-border"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                            selected
                              ? "bg-brand border-brand"
                              : "border-border"
                          )}
                        >
                          {selected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {service.name}
                          </p>
                          <p className="text-xs text-muted">
                            {service.code}
                            {service.state ? ` · ${service.state}` : ""}
                          </p>
                        </div>
                        <Building2 className="w-4 h-4 text-muted/50 flex-shrink-0" />
                      </button>
                    );
                  })}
                  {(!services || services.length === 0) && (
                    <p className="text-center text-sm text-muted py-4">
                      No active services found
                    </p>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border/50 bg-surface/30 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {selectedServiceIds.length > 0
                    ? `${selectedServiceIds.length} service${selectedServiceIds.length > 1 ? "s" : ""} selected`
                    : "Company-wide (no service filter)"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={onCancel}
                    className="text-xs px-4 py-2 text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNextStep}
                    className="text-xs px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors font-medium"
                  >
                    Next: Select Attendees
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep("services")}
                    className="text-xs px-3 py-1.5 text-muted hover:text-foreground transition-colors"
                  >
                    ← Back to Services
                  </button>
                  <button
                    onClick={() => {
                      if (filteredUsers) setSelectedUserIds(filteredUsers.map((u) => u.id));
                    }}
                    className="text-xs px-3 py-1.5 text-muted hover:text-foreground transition-colors"
                  >
                    Select All
                  </button>
                  {selectedUserIds.length > 0 && (
                    <button
                      onClick={() => setSelectedUserIds([])}
                      className="text-xs px-3 py-1.5 text-muted hover:text-foreground transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Search Users */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>

                {/* Users List */}
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {filteredUsers.map((user) => {
                    const selected = selectedUserIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => toggleUser(user.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                          selected
                            ? "border-brand bg-brand/5"
                            : "border-border hover:border-border"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                            selected
                              ? "bg-brand border-brand"
                              : "border-border"
                          )}
                        >
                          {selected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {user.name}
                          </p>
                          <p className="text-xs text-muted truncate">
                            {user.email}
                          </p>
                        </div>
                        <Users className="w-4 h-4 text-muted/50 flex-shrink-0" />
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <p className="text-center text-sm text-muted py-4">
                      No users found
                    </p>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border/50 bg-surface/30 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {selectedUserIds.length > 0
                    ? `${selectedUserIds.length} attendee${selectedUserIds.length > 1 ? "s" : ""} selected`
                    : "No attendees selected (skip to start)"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={onCancel}
                    className="text-xs px-4 py-2 text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onStart(selectedServiceIds, selectedUserIds)}
                    disabled={isPending}
                    className="text-xs px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:opacity-50"
                  >
                    {isPending ? "Starting..." : "Start Meeting"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
