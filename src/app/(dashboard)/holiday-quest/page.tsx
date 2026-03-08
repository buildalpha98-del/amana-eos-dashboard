"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Palmtree,
  Plus,
  Sparkles,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
  Copy,
  Check,
  Trash2,
  Mail,
  MessageSquare,
  AlertTriangle,
  Sun,
  Users,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import { useServices } from "@/hooks/useServices";
import {
  useHolidayQuestDays,
  useCreateHolidayQuestDays,
  useUpdateHolidayQuestDay,
  useDeleteHolidayQuestDay,
  useGenerateHolidayQuestPromo,
} from "@/hooks/useHolidayQuest";
import type { HolidayQuestDayData } from "@/hooks/useHolidayQuest";

// ── Week Templates ─────────────────────────────────────────

const WEEK_TEMPLATES = [
  {
    name: "Adventure Week",
    days: [
      { theme: "Jungle Explorers", morningActivity: "Build jungle obstacle courses and rope bridges", afternoonActivity: "Craft tropical animal masks and habitats" },
      { theme: "Pirate Treasure Hunt", morningActivity: "Design treasure maps and solve clue puzzles", afternoonActivity: "Outdoor treasure hunt with team challenges" },
      { theme: "Survival Skills", morningActivity: "Shelter building and knot-tying workshops", afternoonActivity: "Nature scavenger hunt and bush tucker tasting" },
      { theme: "Mountain Climbers", morningActivity: "Indoor rock wall and balance challenges", afternoonActivity: "Create 3D mountain landscapes with papier-mache" },
      { theme: "Ocean Adventurers", morningActivity: "Marine biology workshop with sea creature craft", afternoonActivity: "Water play games and relay races" },
    ],
  },
  {
    name: "Creative Arts Week",
    days: [
      { theme: "Paint Splash Party", morningActivity: "Canvas painting and colour mixing experiments", afternoonActivity: "Tie-dye t-shirt design workshop" },
      { theme: "Drama Stars", morningActivity: "Improv games and script writing workshop", afternoonActivity: "Rehearse and perform short plays" },
      { theme: "Music Makers", morningActivity: "Build DIY musical instruments", afternoonActivity: "Band jam session and music video filming" },
      { theme: "Sculpture Studio", morningActivity: "Clay modelling and pottery techniques", afternoonActivity: "Recycled art sculpture challenge" },
      { theme: "Gallery Opening", morningActivity: "Frame and curate artwork from the week", afternoonActivity: "Art gallery exhibition and awards ceremony" },
    ],
  },
  {
    name: "STEM Discovery",
    days: [
      { theme: "Rocket Scientists", morningActivity: "Design and launch water bottle rockets", afternoonActivity: "Planetarium dome and star constellation craft" },
      { theme: "Robot Builders", morningActivity: "Coding basics with Scratch Jr and Bee-Bots", afternoonActivity: "Build cardboard robots with LED lights" },
      { theme: "Chemistry Lab", morningActivity: "Slime making and volcano experiments", afternoonActivity: "Crystal growing and colour-changing experiments" },
      { theme: "Engineering Challenge", morningActivity: "Bridge building competition with spaghetti", afternoonActivity: "Marble run design and testing" },
      { theme: "Invention Convention", morningActivity: "Design a solution to a real-world problem", afternoonActivity: "Present inventions and peer voting awards" },
    ],
  },
  {
    name: "Sports Spectacular",
    days: [
      { theme: "Olympic Games", morningActivity: "Mini Olympics — track and field events", afternoonActivity: "Medal ceremony and country flag craft" },
      { theme: "Team Sports Day", morningActivity: "Soccer, basketball, and netball rotations", afternoonActivity: "Dodgeball tournament and relay races" },
      { theme: "Martial Arts & Yoga", morningActivity: "Introductory karate and self-defence workshop", afternoonActivity: "Yoga and mindfulness session with relaxation" },
      { theme: "Dance-Off", morningActivity: "Learn hip-hop and contemporary dance routines", afternoonActivity: "Dance battle competition and freestyle jam" },
      { theme: "Ninja Warrior", morningActivity: "Obstacle course time trials", afternoonActivity: "Team ninja challenges and awards" },
    ],
  },
  {
    name: "Around the World",
    days: [
      { theme: "Japan Day", morningActivity: "Origami workshop and Japanese calligraphy", afternoonActivity: "Sushi making and chopstick games" },
      { theme: "Mexico Fiesta", morningActivity: "Pinata making and papel picado craft", afternoonActivity: "Salsa dancing and taco taste test" },
      { theme: "African Safari", morningActivity: "African drumming circle and mask making", afternoonActivity: "Safari adventure game and beaded jewellery" },
      { theme: "Italian Adventure", morningActivity: "Pizza making from scratch", afternoonActivity: "Venetian mask craft and bocce tournament" },
      { theme: "Australian Outback", morningActivity: "Indigenous dot painting and boomerang craft", afternoonActivity: "Bush games and damper making" },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────

function getWeekDates(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diff = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  start.setDate(start.getDate() + diff);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-green-100 text-green-700",
  full: "bg-amber-100 text-amber-700",
};

// ── Main Page ──────────────────────────────────────────────

export default function HolidayQuestPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "owner" || session?.user?.role === "admin";

  // State
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingDay, setEditingDay] = useState<HolidayQuestDayData | null>(null);
  const [showNewDayForm, setShowNewDayForm] = useState<string | null>(null); // date string
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [promoTab, setPromoTab] = useState<"email" | "social">("email");

  // New day form state
  const [newDay, setNewDay] = useState({
    theme: "",
    morningActivity: "",
    afternoonActivity: "",
    isExcursion: false,
    excursionVenue: "",
    excursionCost: "",
    materialsNeeded: "",
    dietaryNotes: "",
    maxCapacity: "40",
  });

  // Template modal state
  const [templateStartDate, setTemplateStartDate] = useState("");

  // Promo modal state
  const [promoFrom, setPromoFrom] = useState("");
  const [promoTo, setPromoTo] = useState("");

  // Data
  const { data: services } = useServices("active");
  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const from = toISODate(weekDates[0]);
  const to = toISODate(weekDates[4]);

  const { data: days, isLoading } = useHolidayQuestDays(selectedServiceId, from, to);
  const createDays = useCreateHolidayQuestDays();
  const updateDay = useUpdateHolidayQuestDay();
  const deleteDay = useDeleteHolidayQuestDay();
  const generatePromo = useGenerateHolidayQuestPromo();

  // Map days by date string for quick lookup
  const dayMap = useMemo(() => {
    const map = new Map<string, HolidayQuestDayData>();
    days?.forEach((d) => map.set(toISODate(new Date(d.date)), d));
    return map;
  }, [days]);

  // Auto-select first service
  if (services && services.length > 0 && !selectedServiceId) {
    setSelectedServiceId(services[0].id);
  }

  // ── Handlers ────────────────────────────────────────────

  function resetNewDay() {
    setNewDay({
      theme: "",
      morningActivity: "",
      afternoonActivity: "",
      isExcursion: false,
      excursionVenue: "",
      excursionCost: "",
      materialsNeeded: "",
      dietaryNotes: "",
      maxCapacity: "40",
    });
  }

  async function handleCreateDay(dateStr: string) {
    if (!selectedServiceId || !newDay.theme || !newDay.morningActivity || !newDay.afternoonActivity) {
      toast({ description: "Please fill in theme and both activities", variant: "destructive" });
      return;
    }
    try {
      await createDays.mutateAsync({
        serviceId: selectedServiceId,
        days: [{
          date: dateStr,
          theme: newDay.theme,
          morningActivity: newDay.morningActivity,
          afternoonActivity: newDay.afternoonActivity,
          isExcursion: newDay.isExcursion,
          excursionVenue: newDay.isExcursion ? newDay.excursionVenue : undefined,
          excursionCost: newDay.isExcursion && newDay.excursionCost ? parseFloat(newDay.excursionCost) : undefined,
          materialsNeeded: newDay.materialsNeeded || undefined,
          dietaryNotes: newDay.dietaryNotes || undefined,
          maxCapacity: parseInt(newDay.maxCapacity) || 40,
        }],
      });
      toast({ description: "Day created" });
      setShowNewDayForm(null);
      resetNewDay();
    } catch {
      toast({ description: "Failed to create day", variant: "destructive" });
    }
  }

  async function handleUpdateDay() {
    if (!editingDay) return;
    try {
      await updateDay.mutateAsync({
        id: editingDay.id,
        theme: editingDay.theme,
        morningActivity: editingDay.morningActivity,
        afternoonActivity: editingDay.afternoonActivity,
        isExcursion: editingDay.isExcursion,
        excursionVenue: editingDay.excursionVenue,
        excursionCost: editingDay.excursionCost,
        materialsNeeded: editingDay.materialsNeeded,
        dietaryNotes: editingDay.dietaryNotes,
        maxCapacity: editingDay.maxCapacity,
        status: editingDay.status,
      });
      toast({ description: "Day updated" });
      setEditingDay(null);
    } catch {
      toast({ description: "Failed to update", variant: "destructive" });
    }
  }

  async function handleDeleteDay(id: string) {
    try {
      await deleteDay.mutateAsync(id);
      toast({ description: "Day deleted" });
      setEditingDay(null);
    } catch {
      toast({ description: "Failed to delete", variant: "destructive" });
    }
  }

  async function handleApplyTemplate(templateIdx: number) {
    if (!selectedServiceId || !templateStartDate) {
      toast({ description: "Select a start date", variant: "destructive" });
      return;
    }
    const template = WEEK_TEMPLATES[templateIdx];
    const start = new Date(templateStartDate);
    // Ensure we start on Monday
    const dayOfWeek = start.getDay();
    if (dayOfWeek !== 1) {
      const diff = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      start.setDate(start.getDate() + diff);
    }

    const daysData = template.days.map((d, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return {
        date: toISODate(date),
        theme: d.theme,
        morningActivity: d.morningActivity,
        afternoonActivity: d.afternoonActivity,
      };
    });

    try {
      await createDays.mutateAsync({ serviceId: selectedServiceId, days: daysData });
      toast({ description: `${template.name} applied!` });
      setShowTemplateModal(false);
      setTemplateStartDate("");
      // Navigate to that week
      const diff = Math.round((start.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000));
      setWeekOffset(diff);
    } catch {
      toast({ description: "Failed to apply template", variant: "destructive" });
    }
  }

  async function handleGeneratePromo() {
    if (!selectedServiceId || !promoFrom || !promoTo) {
      toast({ description: "Select a date range", variant: "destructive" });
      return;
    }
    try {
      await generatePromo.mutateAsync({
        serviceId: selectedServiceId,
        from: promoFrom,
        to: promoTo,
      });
    } catch {
      toast({ description: "Failed to generate promo", variant: "destructive" });
    }
  }

  function copyCaption(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Palmtree className="h-6 w-6 text-teal-600" />
            Holiday Quest
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Plan vacation care programmes, generate promo content, and track bookings
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            value={selectedServiceId || ""}
            onChange={(e) => setSelectedServiceId(e.target.value || null)}
          >
            <option value="">Select centre...</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Sparkles className="h-4 w-4" />
                Template
              </button>
              <button
                onClick={() => setShowPromoModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                <Megaphone className="h-4 w-4" />
                Generate Promo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <div className="text-sm font-medium text-gray-700">
          {fmtDate(weekDates[0])} — {fmtDate(weekDates[4])}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setWeekOffset(0)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Week Grid */}
      {!selectedServiceId ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <Palmtree className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">Select a centre to view Holiday Quest plans</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {weekDates.map((date) => {
            const dateStr = toISODate(date);
            const day = dayMap.get(dateStr);
            const isEditing = editingDay?.id === day?.id;
            const isNewForm = showNewDayForm === dateStr;

            return (
              <div key={dateStr} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Day header */}
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    {date.toLocaleDateString("en-AU", { weekday: "short" })}
                  </p>
                  <p className="text-sm font-medium text-gray-900">
                    {date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </p>
                </div>

                {day ? (
                  /* Filled day card */
                  <div
                    className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${isEditing ? "ring-2 ring-teal-500 ring-inset" : ""}`}
                    onClick={() => !isEditing && isAdmin && setEditingDay({ ...day })}
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{day.theme}</p>
                      {day.isExcursion && (
                        <MapPin className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      <span className="font-medium text-gray-600">AM:</span> {day.morningActivity.slice(0, 60)}{day.morningActivity.length > 60 ? "..." : ""}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      <span className="font-medium text-gray-600">PM:</span> {day.afternoonActivity.slice(0, 60)}{day.afternoonActivity.length > 60 ? "..." : ""}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className={`inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusColors[day.status] || statusColors.draft}`}>
                        {day.status}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {day.currentBookings}/{day.maxCapacity}
                      </span>
                    </div>
                  </div>
                ) : isNewForm ? (
                  /* New day form */
                  <div className="p-3 space-y-2">
                    <input
                      placeholder="Theme"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                      value={newDay.theme}
                      onChange={(e) => setNewDay({ ...newDay, theme: e.target.value })}
                    />
                    <textarea
                      placeholder="Morning activity"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
                      rows={2}
                      value={newDay.morningActivity}
                      onChange={(e) => setNewDay({ ...newDay, morningActivity: e.target.value })}
                    />
                    <textarea
                      placeholder="Afternoon activity"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
                      rows={2}
                      value={newDay.afternoonActivity}
                      onChange={(e) => setNewDay({ ...newDay, afternoonActivity: e.target.value })}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={newDay.isExcursion}
                        onChange={(e) => setNewDay({ ...newDay, isExcursion: e.target.checked })}
                      />
                      Excursion
                    </label>
                    {newDay.isExcursion && (
                      <input
                        placeholder="Venue"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                        value={newDay.excursionVenue}
                        onChange={(e) => setNewDay({ ...newDay, excursionVenue: e.target.value })}
                      />
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleCreateDay(dateStr)}
                        disabled={createDays.isPending}
                        className="flex-1 rounded bg-teal-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setShowNewDayForm(null); resetNewDay(); }}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Empty day */
                  <div className="p-3 flex flex-col items-center justify-center min-h-[120px]">
                    {isAdmin ? (
                      <button
                        onClick={() => { setShowNewDayForm(dateStr); resetNewDay(); }}
                        className="flex flex-col items-center gap-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                      >
                        <Plus className="h-6 w-6" />
                        <span className="text-xs">Add Day</span>
                      </button>
                    ) : (
                      <p className="text-xs text-gray-400">No plan</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Day Panel */}
      {editingDay && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setEditingDay(null)} />
          <div className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-xl border-l border-gray-200">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Edit Day</h2>
              <button onClick={() => setEditingDay(null)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={editingDay.theme}
                  onChange={(e) => setEditingDay({ ...editingDay, theme: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Morning Activity</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={editingDay.morningActivity}
                  onChange={(e) => setEditingDay({ ...editingDay, morningActivity: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Afternoon Activity</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={editingDay.afternoonActivity}
                  onChange={(e) => setEditingDay({ ...editingDay, afternoonActivity: e.target.value })}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={editingDay.isExcursion}
                    onChange={(e) => setEditingDay({ ...editingDay, isExcursion: e.target.checked })}
                  />
                  <MapPin className="h-4 w-4 text-amber-600" />
                  Excursion Day
                </label>
              </div>
              {editingDay.isExcursion && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Excursion Venue</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editingDay.excursionVenue || ""}
                      onChange={(e) => setEditingDay({ ...editingDay, excursionVenue: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Excursion Cost ($)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editingDay.excursionCost ?? ""}
                      onChange={(e) => setEditingDay({ ...editingDay, excursionCost: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  {/* Risk Assessment Card */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="h-4 w-4" /> Excursion Risk Summary
                    </p>
                    <ul className="text-xs text-amber-700 space-y-1">
                      <li className="flex items-start gap-1.5">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span><strong>Venue:</strong> {editingDay.excursionVenue || "Not specified"}</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Users className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span><strong>Supervision ratio:</strong> 1:8 (excursion standard)</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Sun className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span><strong>Weather:</strong> Check BOM forecast day-of; have indoor backup plan</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span><strong>Transport:</strong> Confirm bus booking; ensure seatbelts for all children</span>
                      </li>
                    </ul>
                    <p className="text-[10px] text-amber-600 mt-2">
                      Ensure risk assessment form is completed and signed off before the excursion.
                    </p>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Materials Needed</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                  rows={2}
                  value={editingDay.materialsNeeded || ""}
                  onChange={(e) => setEditingDay({ ...editingDay, materialsNeeded: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dietary Notes</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                  rows={2}
                  value={editingDay.dietaryNotes || ""}
                  onChange={(e) => setEditingDay({ ...editingDay, dietaryNotes: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={editingDay.maxCapacity}
                    onChange={(e) => setEditingDay({ ...editingDay, maxCapacity: parseInt(e.target.value) || 40 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={editingDay.status}
                    onChange={(e) => setEditingDay({ ...editingDay, status: e.target.value })}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="full">Full</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleUpdateDay}
                  disabled={updateDay.isPending}
                  className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {updateDay.isPending ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => handleDeleteDay(editingDay.id)}
                  disabled={deleteDay.isPending}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowTemplateModal(false)} />
          <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-600" />
                Generate from Template
              </h2>
              <button onClick={() => setShowTemplateModal(false)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Week starting (Monday)</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={templateStartDate}
                  onChange={(e) => setTemplateStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                {WEEK_TEMPLATES.map((t, idx) => (
                  <button
                    key={t.name}
                    onClick={() => handleApplyTemplate(idx)}
                    disabled={createDays.isPending || !templateStartDate}
                    className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-teal-400 hover:bg-teal-50 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t.days.map((d) => d.theme).join(" \u2022 ")}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Promo Modal */}
      {showPromoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowPromoModal(false)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-teal-600" />
                Generate Promotional Content
              </h2>
              <button onClick={() => setShowPromoModal(false)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Date range */}
              {!generatePromo.data && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={promoFrom}
                      onChange={(e) => setPromoFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={promoTo}
                      onChange={(e) => setPromoTo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {!generatePromo.data && (
                <button
                  onClick={handleGeneratePromo}
                  disabled={generatePromo.isPending || !promoFrom || !promoTo}
                  className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {generatePromo.isPending ? "Generating..." : "Generate Content"}
                </button>
              )}

              {/* Results */}
              {generatePromo.data && (
                <>
                  {/* Tabs */}
                  <div className="flex border-b border-gray-200">
                    <button
                      onClick={() => setPromoTab("email")}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${promoTab === "email" ? "border-teal-600 text-teal-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    >
                      <Mail className="h-4 w-4" /> Email
                    </button>
                    <button
                      onClick={() => setPromoTab("social")}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${promoTab === "social" ? "border-teal-600 text-teal-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    >
                      <MessageSquare className="h-4 w-4" /> Social Posts
                    </button>
                  </div>

                  {promoTab === "email" && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">
                        Subject: <strong>{generatePromo.data.email.subject}</strong>
                      </p>
                      <div
                        className="rounded-lg border border-gray-200 overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: generatePromo.data.email.html }}
                      />
                    </div>
                  )}

                  {promoTab === "social" && (
                    <div className="space-y-3">
                      {generatePromo.data.socialPosts.map((post, idx) => (
                        <div key={idx} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500">
                              {fmtDate(post.date)}
                            </span>
                            <button
                              onClick={() => copyCaption(post.caption, idx)}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                            >
                              {copiedIdx === idx ? (
                                <><Check className="h-3 w-3 text-green-600" /> Copied</>
                              ) : (
                                <><Copy className="h-3 w-3" /> Copy</>
                              )}
                            </button>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-line">{post.caption}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => { generatePromo.reset(); setPromoFrom(""); setPromoTo(""); }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Generate for Different Period
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
