"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, GanttChart } from "lucide-react";
import { usePosts, useCampaigns, useMarketingTasks } from "@/hooks/useMarketing";
import type { PostData } from "@/hooks/useMarketing";
import { TimelineView } from "./TimelineView";
import { CreatePostModal } from "./CreatePostModal";

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "border-blue-500",
  instagram: "border-pink-500",
  linkedin: "border-sky-500",
  email: "border-amber-500",
  newsletter: "border-teal-500",
  website: "border-emerald-500",
  flyer: "border-orange-500",
};

const STATUS_DOTS: Record<string, string> = {
  draft: "bg-gray-400",
  in_review: "bg-yellow-400",
  approved: "bg-blue-400",
  scheduled: "bg-indigo-400",
  published: "bg-green-400",
};

interface CalendarTabProps {
  onSelectPost: (id: string) => void;
  onSelectCampaign?: (id: string) => void;
  onSelectTask?: (id: string) => void;
  serviceId: string;
}

export function CalendarTab({ onSelectPost, onSelectCampaign, onSelectTask, serviceId }: CalendarTabProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [viewMode, setViewMode] = useState<"calendar" | "timeline">("calendar");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  const { data: posts, isLoading } = usePosts({
    serviceId: serviceId || undefined,
  });

  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns({
    serviceId: serviceId || undefined,
  });

  const { data: tasks, isLoading: tasksLoading } = useMarketingTasks({
    serviceId: serviceId || undefined,
  });

  const days = useMemo(() => {
    // Build array of dates for the calendar grid
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Find Monday before or on the 1st
    const startDay = new Date(firstDay);
    const dayOfWeek = startDay.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
    startDay.setDate(startDay.getDate() - diff);

    // Find Sunday after or on the last day
    const endDay = new Date(lastDay);
    const endDayOfWeek = endDay.getDay();
    const endDiff = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
    endDay.setDate(endDay.getDate() + endDiff);

    const result: Date[] = [];
    const current = new Date(startDay);
    while (current <= endDay) {
      result.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return result;
  }, [currentDate]);

  // Group posts by date
  const postsByDate = useMemo(() => {
    const map: Record<string, PostData[]> = {};
    if (!posts) return map;
    for (const post of posts) {
      if (!post.scheduledDate) continue;
      const dateKey = new Date(post.scheduledDate).toISOString().split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(post);
    }
    return map;
  }, [posts]);

  // Group tasks by due date
  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!tasks) return map;
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const dateKey = new Date(task.dueDate).toISOString().split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(task);
    }
    return map;
  }, [tasks]);

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const monthLabel = currentDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  if (isLoading || (viewMode === "timeline" && (campaignsLoading || tasksLoading))) {
    return <div className="flex items-center justify-center py-12 text-gray-500">Loading calendar...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header: month navigation + view toggle */}
      <div className="flex items-center justify-between">
        {viewMode === "calendar" ? (
          <>
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">{monthLabel}</h3>
            <div className="flex items-center gap-2">
              <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
              <div className="ml-2 flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setViewMode("calendar")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#004E64] text-white"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Calendar
                </button>
                <button
                  onClick={() => setViewMode("timeline")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <GanttChart className="w-3.5 h-3.5" />
                  Timeline
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode("calendar")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#004E64] text-white"
              >
                <GanttChart className="w-3.5 h-3.5" />
                Timeline
              </button>
            </div>
          </>
        )}
      </div>

      {viewMode === "timeline" ? (
        <TimelineView
          posts={posts || []}
          campaigns={campaigns || []}
          tasks={tasks || []}
          onSelectPost={onSelectPost}
          onSelectCampaign={onSelectCampaign || (() => {})}
          onSelectTask={onSelectTask || (() => {})}
        />
      ) : (
        /* Calendar grid */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-2 py-2 text-xs font-medium text-gray-500 text-center">
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dateKey = day.toISOString().split("T")[0];
              const isToday = dateKey === today;
              const isCurrentMonth = day.getMonth() === currentMonth;
              const dayPosts = postsByDate[dateKey] || [];
              const dayTasks = tasksByDate[dateKey] || [];
              const totalItems = dayPosts.length + dayTasks.length;

              return (
                <div
                  key={i}
                  onClick={() => {
                    // Format as datetime-local value: YYYY-MM-DDT09:00
                    const yyyy = day.getFullYear();
                    const mm = String(day.getMonth() + 1).padStart(2, "0");
                    const dd = String(day.getDate()).padStart(2, "0");
                    setSelectedDate(`${yyyy}-${mm}-${dd}T09:00`);
                    setShowCreateModal(true);
                  }}
                  className={`min-h-[100px] border-b border-r border-gray-100 p-1 cursor-pointer transition-colors hover:bg-[#004E64]/[0.03] ${
                    !isCurrentMonth ? "bg-gray-50 hover:bg-gray-100/80" : ""
                  } ${isToday ? "ring-2 ring-inset ring-[#004E64]" : ""}`}
                >
                  <div className={`text-xs font-medium mb-1 ${
                    isCurrentMonth ? "text-gray-900" : "text-gray-400"
                  } ${isToday ? "text-[#004E64] font-bold" : ""}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map((post) => (
                      <button
                        key={post.id}
                        onClick={(e) => { e.stopPropagation(); onSelectPost(post.id); }}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight border-l-2 ${
                          PLATFORM_COLORS[post.platform] || "border-gray-300"
                        } bg-gray-50 hover:bg-gray-100 transition-colors truncate flex items-center gap-1`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[post.status] || "bg-gray-400"}`} />
                        <span className="truncate">{post.title}</span>
                      </button>
                    ))}
                    {dayTasks.slice(0, Math.max(1, 3 - dayPosts.length)).map((task: any) => (
                      <button
                        key={task.id}
                        onClick={(e) => { e.stopPropagation(); onSelectTask?.(task.id); }}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight border-l-2 border-[#004E64] bg-[#004E64]/5 hover:bg-[#004E64]/10 transition-colors truncate flex items-center gap-1"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          task.status === "done" ? "bg-green-400" : task.status === "in_progress" ? "bg-blue-400" : "bg-gray-400"
                        }`} />
                        <span className="truncate">{task.title}</span>
                      </button>
                    ))}
                    {totalItems > 3 && (
                      <div className="text-[10px] text-gray-400 px-1">+{totalItems - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Post Modal — opened by clicking a day cell */}
      <CreatePostModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        defaultDate={selectedDate}
      />
    </div>
  );
}
