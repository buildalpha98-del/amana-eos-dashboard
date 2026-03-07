"use client";

import { useMemo } from "react";
import type {
  PostData,
  CampaignData,
  MarketingTaskData,
} from "@/hooks/useMarketing";

interface TimelineViewProps {
  posts: PostData[];
  campaigns: CampaignData[];
  tasks: MarketingTaskData[];
  onSelectPost: (id: string) => void;
  onSelectCampaign: (id: string) => void;
  onSelectTask: (id: string) => void;
}

/* ── colour maps ─────────────────────────────────────────────── */

const CAMPAIGN_COLORS: Record<string, string> = {
  campaign: "bg-blue-200 text-blue-800",
  event: "bg-purple-200 text-purple-800",
  activation: "bg-orange-200 text-orange-800",
  launch: "bg-emerald-200 text-emerald-800",
  promotion: "bg-pink-200 text-pink-800",
  awareness: "bg-cyan-200 text-cyan-800",
  partnership: "bg-amber-200 text-amber-800",
};

const PLATFORM_DOT_COLORS: Record<string, string> = {
  facebook: "bg-blue-500",
  instagram: "bg-pink-500",
  linkedin: "bg-sky-500",
  email: "bg-amber-500",
  newsletter: "bg-teal-500",
  website: "bg-emerald-500",
  flyer: "bg-orange-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

/* ── helpers ─────────────────────────────────────────────────── */

/** Returns "YYYY-MM-DD" in local time for a Date object. */
function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── component ───────────────────────────────────────────────── */

export function TimelineView({
  posts,
  campaigns,
  tasks,
  onSelectPost,
  onSelectCampaign,
  onSelectTask,
}: TimelineViewProps) {
  /* Build 28-day range: 7 days ago → 21 days ahead */
  const days = useMemo(() => {
    const result: Date[] = [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  const todayKey = toDateKey(new Date());
  const startKey = toDateKey(days[0]);
  const endKey = toDateKey(days[days.length - 1]);

  /* ── campaigns laid out on the grid ───────────────────────── */
  const campaignRows = useMemo(() => {
    // Filter campaigns that overlap the visible range
    return campaigns.filter((c) => {
      if (!c.startDate && !c.endDate) return false;
      const cStart = c.startDate ? toDateKey(new Date(c.startDate)) : startKey;
      const cEnd = c.endDate ? toDateKey(new Date(c.endDate)) : endKey;
      return cStart <= endKey && cEnd >= startKey;
    });
  }, [campaigns, startKey, endKey]);

  /* ── posts grouped by date ────────────────────────────────── */
  const postsByDate = useMemo(() => {
    const map: Record<string, PostData[]> = {};
    for (const post of posts) {
      if (!post.scheduledDate) continue;
      const key = toDateKey(new Date(post.scheduledDate));
      if (key < startKey || key > endKey) continue;
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return map;
  }, [posts, startKey, endKey]);

  /* ── tasks grouped by date ────────────────────────────────── */
  const tasksByDate = useMemo(() => {
    const map: Record<string, MarketingTaskData[]> = {};
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = toDateKey(new Date(task.dueDate));
      if (key < startKey || key > endKey) continue;
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [tasks, startKey, endKey]);

  /* ── helpers for campaign bar placement ───────────────────── */
  function colIndex(dateStr: string) {
    const idx = days.findIndex((d) => toDateKey(d) === dateStr);
    return idx === -1 ? 0 : idx;
  }

  function campaignSpan(c: CampaignData) {
    const cStartKey = c.startDate ? toDateKey(new Date(c.startDate)) : startKey;
    const cEndKey = c.endDate ? toDateKey(new Date(c.endDate)) : endKey;
    const start = Math.max(0, colIndex(cStartKey < startKey ? startKey : cStartKey));
    const end = Math.min(27, colIndex(cEndKey > endKey ? endKey : cEndKey));
    return { start, end };
  }

  const COL_W = 48; // px per day column
  const totalW = 28 * COL_W;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalW }}>
          {/* ── Date header ──────────────────────────────────── */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
            {/* Label column */}
            <div className="w-24 flex-shrink-0 border-r border-gray-200" />
            {/* Day columns */}
            {days.map((d) => {
              const key = toDateKey(d);
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={`flex-shrink-0 text-center py-2 text-xs font-medium border-r border-gray-100 ${
                    isToday
                      ? "bg-[#004E64]/5 border-l-2 border-l-[#004E64]"
                      : ""
                  }`}
                  style={{ width: COL_W }}
                >
                  <div className={isToday ? "text-[#004E64] font-bold" : "text-gray-900"}>
                    {d.getDate()}
                  </div>
                  <div className={isToday ? "text-[#004E64]" : "text-gray-400"}>
                    {DAY_NAMES[d.getDay()]}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Campaigns section ────────────────────────────── */}
          <div className="border-b border-gray-200">
            {/* Section label */}
            <div className="flex">
              <div className="w-24 flex-shrink-0 border-r border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                Campaigns
              </div>
              <div className="flex flex-1">
                {days.map((d) => {
                  const key = toDateKey(d);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={`flex-shrink-0 border-r border-gray-100 ${
                        isToday ? "border-l-2 border-l-[#004E64] bg-[#004E64]/5" : ""
                      }`}
                      style={{ width: COL_W }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Campaign bars */}
            {campaignRows.length === 0 && (
              <div className="flex">
                <div className="w-24 flex-shrink-0 border-r border-gray-200" />
                <div className="py-3 px-4 text-xs text-gray-400 italic">
                  No campaigns in this range
                </div>
              </div>
            )}
            {campaignRows.map((campaign) => {
              const { start, end } = campaignSpan(campaign);
              const span = end - start + 1;
              const colors =
                CAMPAIGN_COLORS[campaign.type] || "bg-gray-200 text-gray-800";

              return (
                <div key={campaign.id} className="flex relative" style={{ height: 32 }}>
                  <div className="w-24 flex-shrink-0 border-r border-gray-200" />
                  {/* Today highlight columns behind the bar */}
                  <div className="flex absolute left-24 top-0 bottom-0" style={{ width: totalW }}>
                    {days.map((d) => {
                      const key = toDateKey(d);
                      const isToday = key === todayKey;
                      return (
                        <div
                          key={key}
                          className={`flex-shrink-0 border-r border-gray-100 ${
                            isToday ? "border-l-2 border-l-[#004E64] bg-[#004E64]/5" : ""
                          }`}
                          style={{ width: COL_W }}
                        />
                      );
                    })}
                  </div>
                  {/* Bar */}
                  <button
                    onClick={() => onSelectCampaign(campaign.id)}
                    className={`absolute z-[1] rounded-md px-2 py-1 text-[11px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity ${colors}`}
                    style={{
                      left: 96 + start * COL_W + 2,
                      width: span * COL_W - 4,
                      top: 4,
                      height: 24,
                    }}
                    title={campaign.name}
                  >
                    {campaign.name}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Posts section ─────────────────────────────────── */}
          <div className="border-b border-gray-200">
            {/* Section label row */}
            <div className="flex">
              <div className="w-24 flex-shrink-0 border-r border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                Posts
              </div>
              <div className="flex flex-1">
                {days.map((d) => {
                  const key = toDateKey(d);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={`flex-shrink-0 border-r border-gray-100 ${
                        isToday ? "border-l-2 border-l-[#004E64] bg-[#004E64]/5" : ""
                      }`}
                      style={{ width: COL_W }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Post dots */}
            <div className="flex" style={{ minHeight: 40 }}>
              <div className="w-24 flex-shrink-0 border-r border-gray-200" />
              {days.map((d) => {
                const key = toDateKey(d);
                const isToday = key === todayKey;
                const dayPosts = postsByDate[key] || [];
                return (
                  <div
                    key={key}
                    className={`flex-shrink-0 border-r border-gray-100 flex flex-wrap items-start justify-center gap-1 py-2 px-0.5 ${
                      isToday ? "border-l-2 border-l-[#004E64] bg-[#004E64]/5" : ""
                    }`}
                    style={{ width: COL_W }}
                  >
                    {dayPosts.map((post) => (
                      <button
                        key={post.id}
                        onClick={() => onSelectPost(post.id)}
                        className={`w-3 h-3 rounded-full flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-shadow ${
                          PLATFORM_DOT_COLORS[post.platform] || "bg-gray-400"
                        }`}
                        title={post.title}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Tasks section ────────────────────────────────── */}
          <div>
            {/* Section label row */}
            <div className="flex">
              <div className="w-24 flex-shrink-0 border-r border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                Tasks
              </div>
              <div className="flex flex-1">
                {days.map((d) => {
                  const key = toDateKey(d);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={`flex-shrink-0 border-r border-gray-100 ${
                        isToday ? "border-l-2 border-l-[#004E64] bg-[#004E64]/5" : ""
                      }`}
                      style={{ width: COL_W }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Task diamonds */}
            <div className="flex" style={{ minHeight: 40 }}>
              <div className="w-24 flex-shrink-0 border-r border-gray-200" />
              {days.map((d) => {
                const key = toDateKey(d);
                const isToday = key === todayKey;
                const dayTasks = tasksByDate[key] || [];
                return (
                  <div
                    key={key}
                    className={`flex-shrink-0 border-r border-gray-100 flex flex-wrap items-start justify-center gap-1 py-2 px-0.5 ${
                      isToday ? "border-l-2 border-l-[#004E64] bg-[#004E64]/5" : ""
                    }`}
                    style={{ width: COL_W }}
                  >
                    {dayTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className={`w-3 h-3 flex-shrink-0 rotate-45 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-shadow ${
                          PRIORITY_COLORS[task.priority] || "bg-gray-400"
                        }`}
                        title={task.title}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
