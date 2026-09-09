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
import { useScorecardsList } from "@/hooks/useScorecards";
import { cn } from "@/lib/utils";
import { fetchApi } from "@/lib/fetch-api";

export function StartMeetingDialog({
  onStart,
  onCancel,
  isPending,
}: {
  onStart: (
    serviceIds: string[],
    attendeeIds: string[],
    isLeadership: boolean,
    scorecardId: string | null,
    scheduledFor: string | null,
    repeatWeekly: boolean,
  ) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { data: services } = useServices("active");
  const { data: scorecardsData } = useScorecardsList();
  const scorecards = scorecardsData?.scorecards ?? [];
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  // 2026-07-28: meetings now start with a type choice. "Leadership" is an
  // org-wide L10 for the leadership team — it skips service selection and
  // narrows the attendee picker to LEADERSHIP_MEETING_ROLES. "Service"
  // keeps the original centre-scoped flow.
  const [step, setStep] = useState<"type" | "services" | "attendees">("type");
  const [isLeadership, setIsLeadership] = useState(false);
  // 2026-07-28: which Scorecard the meeting reviews. null = the legacy
  // single scorecard, which is also the fallback for older meetings.
  const [scorecardId, setScorecardId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  // 2026-08-31: schedule-for-later. When enabled, the meeting is created
  // as `scheduled` (dated scheduledFor) instead of starting immediately.
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  // 2026-08-31: creates a MeetingSeries so this meeting repeats weekly.
  const [repeatWeekly, setRepeatWeekly] = useState(false);

  const { data: allUsers } = useQuery<{ id: string; name: string; email: string; role: string; serviceId?: string | null }[]>({
    queryKey: ["users-list-full", isLeadership ? "leadership" : "eos_assignees"],
    queryFn: () =>
      fetchApi<{ id: string; name: string; email: string; role: string; serviceId?: string | null }[]>(
        isLeadership
          ? "/api/users?scope=leadership"
          : "/api/users?scope=eos_assignees",
      ),
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
                {step === "type"
                  ? "What kind of meeting is this?"
                  : step === "services"
                    ? "Select which services to include in this meeting"
                    : isLeadership
                      ? "Select the leadership team members present"
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

          {step === "type" ? (
            <div className="p-6 space-y-3">
              <button
                onClick={() => {
                  setIsLeadership(true);
                  setSelectedServiceIds([]);
                  setSelectedUserIds([]);
                  setStep("attendees");
                }}
                className="w-full text-left rounded-lg border border-border p-4 hover:border-brand hover:bg-brand/5 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-brand" />
                  <span className="text-sm font-semibold text-foreground">
                    Leadership Meeting (L10)
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Organisation-wide. Only the leadership team can be added,
                  and the To-Do review shows just their items.
                </p>
              </button>
              <button
                onClick={() => {
                  setIsLeadership(false);
                  setSelectedUserIds([]);
                  setStep("services");
                }}
                className="w-full text-left rounded-lg border border-border p-4 hover:border-brand hover:bg-brand/5 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-brand" />
                  <span className="text-sm font-semibold text-foreground">
                    Service / Team Meeting
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Scoped to one or more centres, with the wider team
                  available as attendees.
                </p>
              </button>
            </div>
          ) : step === "services" ? (
            <>
              <div className="p-6 space-y-4">
                {/* Quick Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onStart([], [], false, null, null, false)}
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
                    onClick={() => setStep(isLeadership ? "type" : "services")}
                    className="text-xs px-3 py-1.5 text-muted hover:text-foreground transition-colors"
                  >
                    {isLeadership ? "← Back" : "← Back to Services"}
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

                {/* 2026-07-28: pick which scorecard this meeting reviews.
                    Only shown when there's more than one to choose from —
                    a single-scorecard org shouldn't be asked. */}
                {scorecards.length > 1 && (
                  <div className="pt-2 border-t border-border/50">
                    <label
                      htmlFor="meeting-scorecard"
                      className="block text-xs font-medium text-foreground mb-1.5"
                    >
                      Scorecard to review
                    </label>
                    <select
                      id="meeting-scorecard"
                      value={scorecardId ?? ""}
                      onChange={(e) => setScorecardId(e.target.value || null)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    >
                      <option value="">Default scorecard</option>
                      {scorecards.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-border/50 bg-surface/30 space-y-3">
                {/* Schedule-for-later toggle (2026-08-31) */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleLater}
                      onChange={(e) => setScheduleLater(e.target.checked)}
                      className="rounded border-border"
                    />
                    Schedule for later
                  </label>
                  {scheduleLater && (
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      aria-label="Scheduled date and time"
                      className="flex-1 px-2 py-1.5 text-xs border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    />
                  )}
                  {scheduleLater && (
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={repeatWeekly}
                        onChange={(e) => setRepeatWeekly(e.target.checked)}
                        className="rounded border-border"
                      />
                      Repeat weekly
                    </label>
                  )}
                </div>
                <div className="flex items-center justify-between">
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
                      onClick={() =>
                        onStart(
                          selectedServiceIds,
                          selectedUserIds,
                          isLeadership,
                          scorecardId,
                          scheduleLater && scheduledFor
                            ? new Date(scheduledFor).toISOString()
                            : null,
                          scheduleLater && repeatWeekly,
                        )
                      }
                      disabled={isPending || (scheduleLater && !scheduledFor)}
                      className="text-xs px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:opacity-50"
                    >
                      {isPending
                        ? scheduleLater
                          ? "Scheduling..."
                          : "Starting..."
                        : scheduleLater
                          ? "Schedule Meeting"
                          : "Start Meeting"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
