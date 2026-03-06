"use client";

import { useState, useMemo } from "react";
import { getWeekStart } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  Copy,
  Clock,
  MapPin,
  User,
  Pencil,
  Trash2,
  X,
  Loader2,
  Library,
  Search,
  Tag,
  FileText,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useWeeklyProgram,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
  useBulkUpsertProgram,
  type ProgramActivity,
  type CreateActivityInput,
} from "@/hooks/useWeeklyProgram";
import { ImportWizard, type ColumnConfig } from "@/components/import/ImportWizard";
import {
  useActivityTemplates,
  type ActivityTemplate,
  type ActivityTemplateFilters,
} from "@/hooks/useActivityLibrary";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

const DAY_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

const IMPORT_COLUMNS: ColumnConfig[] = [
  { key: "day", label: "Day", required: true },
  { key: "startTime", label: "Start Time (HH:mm)", required: true },
  { key: "endTime", label: "End Time (HH:mm)", required: true },
  { key: "title", label: "Title", required: true },
  { key: "description", label: "Description" },
  { key: "staffName", label: "Staff Member" },
  { key: "location", label: "Location" },
];

function formatWeekLabel(date: Date): string {
  return `Week of ${date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function getTimeColor(time: string): string {
  const hour = parseInt(time.split(":")[0], 10);
  if (hour < 10) return "bg-blue-50 border-blue-200";
  if (hour < 13) return "bg-amber-50 border-amber-200";
  return "bg-emerald-50 border-emerald-200";
}

export function ServiceProgramTab({ serviceId }: { serviceId: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ProgramActivity | null>(null);
  const [prefillTemplate, setPrefillTemplate] = useState<ActivityTemplate | null>(null);

  const currentWeek = getWeekStart();
  const selectedWeek = new Date(currentWeek);
  selectedWeek.setDate(selectedWeek.getDate() - weekOffset * 7);
  const weekKey = selectedWeek.toISOString().split("T")[0];

  const { data: activities, isLoading } = useWeeklyProgram(serviceId, weekKey);
  const createMutation = useCreateActivity(serviceId);
  const updateMutation = useUpdateActivity(serviceId);
  const deleteMutation = useDeleteActivity(serviceId);
  const bulkMutation = useBulkUpsertProgram(serviceId);

  // Group activities by day
  const byDay = useMemo(() => {
    const grouped: Record<string, ProgramActivity[]> = {};
    DAYS.forEach((d) => (grouped[d] = []));
    (activities || []).forEach((a) => {
      if (grouped[a.day]) grouped[a.day].push(a);
    });
    return grouped;
  }, [activities]);

  const handleCopyPrevious = async () => {
    const prevWeek = new Date(selectedWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const prevKey = prevWeek.toISOString().split("T")[0];

    try {
      const res = await fetch(
        `/api/services/${serviceId}/programs?weekStart=${prevKey}`
      );
      if (!res.ok) throw new Error("Failed to fetch previous week");
      const prevActivities: ProgramActivity[] = await res.json();

      if (prevActivities.length === 0) {
        toast({ description: "No activities found in previous week", variant: "destructive" });
        return;
      }

      await bulkMutation.mutateAsync({
        weekStart: weekKey,
        activities: prevActivities.map((a) => ({
          day: a.day,
          startTime: a.startTime,
          endTime: a.endTime,
          title: a.title,
          description: a.description || undefined,
          staffName: a.staffName || undefined,
          location: a.location || undefined,
          notes: a.notes || undefined,
        })),
      });

      toast({ description: "Copied previous week's program" });
    } catch {
      toast({ description: "Failed to copy previous week", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ description: "Activity deleted" });
    } catch {
      toast({ description: "Failed to delete activity", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[220px] text-center">
            {formatWeekLabel(selectedWeek)}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-[#004E64] hover:underline ml-2"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyPrevious}
            disabled={bulkMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Prev Week
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <button
            onClick={() => setShowLibraryPicker(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Library className="w-3.5 h-3.5" />
            Browse Library
          </button>
          <button
            onClick={() => {
              setEditingActivity(null);
              setPrefillTemplate(null);
              setShowModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Activity
          </button>
        </div>
      </div>

      {/* Day Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#004E64] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {DAYS.map((day) => (
            <div key={day} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  <span className="hidden md:inline">{DAY_LABELS[day]}</span>
                  <span className="md:hidden">{DAY_SHORT[day]}</span>
                </h3>
                <span className="text-xs text-gray-400">
                  {byDay[day]?.length || 0}
                </span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {byDay[day]?.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onEdit={() => {
                      setEditingActivity(activity);
                      setShowModal(true);
                    }}
                    onDelete={() => handleDelete(activity.id)}
                  />
                ))}
                {byDay[day]?.length === 0 && (
                  <button
                    onClick={() => {
                      setEditingActivity(null);
                      setShowModal(true);
                    }}
                    className="w-full py-6 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-[#004E64] hover:text-[#004E64] transition-colors"
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!activities || activities.length === 0) && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">
            No activities scheduled this week. Add activities or import from CSV.
          </p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <ActivityModal
          serviceId={serviceId}
          weekStart={weekKey}
          activity={editingActivity}
          prefillTemplate={prefillTemplate}
          onClose={() => {
            setShowModal(false);
            setEditingActivity(null);
            setPrefillTemplate(null);
          }}
          onCreate={createMutation}
          onUpdate={updateMutation}
        />
      )}

      {/* Library Picker */}
      {showLibraryPicker && (
        <ActivityLibraryPickerModal
          onSelect={(template) => {
            setShowLibraryPicker(false);
            setEditingActivity(null);
            setPrefillTemplate(template);
            setShowModal(true);
          }}
          onClose={() => setShowLibraryPicker(false)}
        />
      )}

      {/* Import Wizard */}
      {showImport && (
        <ImportWizard
          title="Import Weekly Program"
          endpoint={`/api/services/${serviceId}/programs/import?weekStart=${weekKey}`}
          columnConfig={IMPORT_COLUMNS}
          onComplete={() => {
            setShowImport(false);
            toast({ description: "Program imported successfully" });
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

// ─── Activity Card ─────────────────────────────────────────────
function ActivityCard({
  activity,
  onEdit,
  onDelete,
}: {
  activity: ProgramActivity;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative p-3 rounded-lg border transition-shadow hover:shadow-sm",
        getTimeColor(activity.startTime)
      )}
    >
      {/* Actions */}
      <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
        <button
          onClick={onEdit}
          className="p-1 rounded bg-white/80 hover:bg-white text-gray-500 hover:text-[#004E64]"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded bg-white/80 hover:bg-white text-gray-500 hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Clock className="w-3 h-3" />
        {activity.startTime} – {activity.endTime}
      </div>
      <p className="text-sm font-medium text-gray-900 leading-tight">
        {activity.title}
      </p>
      {activity.description && (
        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
          {activity.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {activity.staffName && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <User className="w-3 h-3" />
            {activity.staffName}
          </span>
        )}
        {activity.location && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="w-3 h-3" />
            {activity.location}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Activity Modal ────────────────────────────────────────────
function ActivityModal({
  serviceId,
  weekStart,
  activity,
  prefillTemplate,
  onClose,
  onCreate,
  onUpdate,
}: {
  serviceId: string;
  weekStart: string;
  activity: ProgramActivity | null;
  prefillTemplate?: ActivityTemplate | null;
  onClose: () => void;
  onCreate: ReturnType<typeof useCreateActivity>;
  onUpdate: ReturnType<typeof useUpdateActivity>;
}) {
  const isEditing = !!activity;
  const [day, setDay] = useState<(typeof DAYS)[number]>(activity?.day || "monday");
  const [startTime, setStartTime] = useState(activity?.startTime || "09:00");
  const [endTime, setEndTime] = useState(activity?.endTime || "10:00");
  const [title, setTitle] = useState(activity?.title || prefillTemplate?.title || "");
  const [description, setDescription] = useState(activity?.description || prefillTemplate?.description || "");
  const [staffName, setStaffName] = useState(activity?.staffName || "");
  const [location, setLocation] = useState(activity?.location || "");

  const isPending = onCreate.isPending || onUpdate.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateActivityInput = {
      weekStart,
      day,
      startTime,
      endTime,
      title,
      description: description || undefined,
      staffName: staffName || undefined,
      location: location || undefined,
    };

    try {
      if (isEditing) {
        await onUpdate.mutateAsync({
          activityId: activity.id,
          ...data,
        });
        toast({ description: "Activity updated" });
      } else {
        await onCreate.mutateAsync(data);
        toast({ description: "Activity created" });
      }
      onClose();
    } catch {
      toast({
        description: isEditing ? "Failed to update" : "Failed to create",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? "Edit Activity" : prefillTemplate ? "Add Activity (from Library)" : "Add Activity"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Day
              </label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as (typeof DAYS)[number])}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Arts & Crafts"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Activity details..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Staff Member
              </label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Hall A"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving..." : isEditing ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Library Picker Modal ────────────────────────────
const PICKER_CATEGORIES = [
  { value: "physical_play", label: "Physical Play" },
  { value: "creative_arts", label: "Creative Arts" },
  { value: "music_movement", label: "Music & Movement" },
  { value: "literacy", label: "Literacy" },
  { value: "numeracy", label: "Numeracy" },
  { value: "nature_outdoors", label: "Nature & Outdoors" },
  { value: "cooking_nutrition", label: "Cooking & Nutrition" },
  { value: "social_emotional", label: "Social & Emotional" },
  { value: "quiet_time", label: "Quiet Time" },
  { value: "free_play", label: "Free Play" },
  { value: "other", label: "Other" },
];

const PICKER_CATEGORY_COLORS: Record<string, string> = {
  physical_play: "bg-blue-100 text-blue-700",
  creative_arts: "bg-pink-100 text-pink-700",
  music_movement: "bg-purple-100 text-purple-700",
  literacy: "bg-amber-100 text-amber-700",
  numeracy: "bg-emerald-100 text-emerald-700",
  nature_outdoors: "bg-green-100 text-green-700",
  cooking_nutrition: "bg-orange-100 text-orange-700",
  social_emotional: "bg-rose-100 text-rose-700",
  quiet_time: "bg-sky-100 text-sky-700",
  free_play: "bg-teal-100 text-teal-700",
  other: "bg-gray-100 text-gray-700",
};

function ActivityLibraryPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (template: ActivityTemplate) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const filters: ActivityTemplateFilters = {
    search: search || undefined,
    category: category || undefined,
    limit: 50,
  };

  const { data, isLoading } = useActivityTemplates(filters);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Library className="w-5 h-5 text-[#004E64]" />
            Browse Activity Library
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-4 border-b border-gray-50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#004E64] focus:ring-1 focus:ring-[#004E64] focus:outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#004E64] focus:ring-1 focus:ring-[#004E64] focus:outline-none"
          >
            <option value="">All Categories</option>
            {PICKER_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-[#004E64] animate-spin" />
            </div>
          ) : !data?.templates.length ? (
            <div className="text-center py-12 text-gray-400">
              <Library className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No templates found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className="text-left p-3 rounded-lg border border-gray-200 hover:border-[#004E64] hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", PICKER_CATEGORY_COLORS[t.category] || PICKER_CATEGORY_COLORS.other)}>
                      {PICKER_CATEGORIES.find((c) => c.value === t.category)?.label || t.category}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {t.durationMinutes && <span>{t.durationMinutes}min</span>}
                      {t.files.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <FileText className="w-3 h-3" />
                          {t.files.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{t.title}</p>
                  {t.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
