/**
 * NQS ratings, as ACECQA publishes them (2026-10-08). The short values
 * are what's stored — `health-score.ts` maps them to points.
 */
import { z } from "zod";

export const NQS_RATINGS = [
  "Excellent",
  "Exceeding",
  "Meeting",
  "Working Towards",
  "Significant Improvement Required",
  "Provisional",
] as const;

export const NQS_RATING_LABELS: Record<(typeof NQS_RATINGS)[number], string> = {
  Excellent: "Excellent",
  Exceeding: "Exceeding NQS",
  Meeting: "Meeting NQS",
  "Working Towards": "Working Towards NQS",
  "Significant Improvement Required": "Significant Improvement Required",
  Provisional: "Provisional – not yet assessed",
};

/** Quality areas 1–7, with ACECQA's names. Excellent is overall-only. */
export const QUALITY_AREAS = [
  { key: "QA1", label: "Educational program and practice" },
  { key: "QA2", label: "Children's health and safety" },
  { key: "QA3", label: "Physical environment" },
  { key: "QA4", label: "Staffing arrangements" },
  { key: "QA5", label: "Relationships with children" },
  { key: "QA6", label: "Collaborative partnerships with families and communities" },
  { key: "QA7", label: "Governance and leadership" },
] as const;

export const QA_RATINGS = ["Exceeding", "Meeting", "Working Towards"] as const;

export const nqsRatingSchema = z.enum(NQS_RATINGS);
export const qaRatingsSchema = z.partialRecord(
  z.enum(["QA1", "QA2", "QA3", "QA4", "QA5", "QA6", "QA7"]),
  z.enum(QA_RATINGS),
);
