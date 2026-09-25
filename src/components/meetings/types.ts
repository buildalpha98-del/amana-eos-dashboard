import type React from "react";

/**
 * Every section key across both run sheets. A single union rather than a
 * bare `string` so ActiveMeetingView's per-section render branches are
 * exhaustively checked against both L10_SECTIONS and
 * QUARTERLY_PULSE_SECTIONS.
 */
export type MeetingSectionKey =
  | "segue"
  | "scorecard"
  | "rocks"
  | "headlines"
  | "todos"
  | "ids"
  | "conclude"
  | "quarter_review"
  | "vto"
  | "break"
  | "set_rocks";

export interface L10Section {
  key: MeetingSectionKey;
  label: string;
  duration: number; // minutes
  icon: React.ElementType;
  color: string;
}
