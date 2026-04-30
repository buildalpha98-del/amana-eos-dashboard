import {
  Users,
  BarChart3,
  Mountain,
  MessageSquare,
  ListChecks,
  Lightbulb,
  Trophy,
} from "lucide-react";
import type { L10Section } from "./types";

export const L10_SECTIONS: L10Section[] = [
  { key: "segue", label: "Segue", duration: 5, icon: Users, color: "text-purple-600" },
  { key: "scorecard", label: "Scorecard Review", duration: 5, icon: BarChart3, color: "text-blue-600" },
  { key: "rocks", label: "Rock Review", duration: 5, icon: Mountain, color: "text-emerald-600" },
  { key: "headlines", label: "Headlines", duration: 5, icon: MessageSquare, color: "text-amber-600" },
  { key: "todos", label: "To-Do List", duration: 5, icon: ListChecks, color: "text-indigo-600" },
  { key: "ids", label: "IDS", duration: 60, icon: Lightbulb, color: "text-red-600" },
  { key: "conclude", label: "Conclude", duration: 5, icon: Trophy, color: "text-brand" },
];
