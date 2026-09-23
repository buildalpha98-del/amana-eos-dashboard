import {
  Users,
  TrendingUp,
  Compass,
  Coffee,
  Flag,
  Lightbulb,
  Trophy,
} from "lucide-react";
import type { L10Section } from "./types";

/**
 * The Quarterly Pulse run sheet — Amana's quarterly EOS meeting, page 1 of
 * the actual pack. Durations total 210 minutes (3.5 hours), matching the
 * pack's allocations. "IDS" here reviews the long_term issue backlog
 * (L10's IDS works short_term) — see ActiveMeetingView's category wiring.
 */
export const QUARTERLY_PULSE_SECTIONS: L10Section[] = [
  { key: "segue", label: "Check-In", duration: 15, icon: Users, color: "text-purple-600" },
  { key: "quarter_review", label: "Review the Quarter", duration: 45, icon: TrendingUp, color: "text-blue-600" },
  { key: "vto", label: "V/TO Review", duration: 20, icon: Compass, color: "text-emerald-600" },
  { key: "break", label: "Break", duration: 10, icon: Coffee, color: "text-amber-600" },
  { key: "set_rocks", label: "Set Next Quarter's Rocks", duration: 75, icon: Flag, color: "text-indigo-600" },
  { key: "ids", label: "IDS", duration: 30, icon: Lightbulb, color: "text-red-600" },
  { key: "conclude", label: "Conclude", duration: 15, icon: Trophy, color: "text-brand" },
];
