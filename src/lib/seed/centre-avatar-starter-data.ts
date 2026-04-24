/**
 * Sprint 3 — Centre Avatar starter data (per Doc 5 Appendix).
 *
 * Seeds Section 1 — Snapshot (numbers, parentDrivers, programmeFocus) for each
 * centre's Avatar. All other sections remain empty; Akram fills them during
 * Week 1-2 of the Avatar rollout.
 */

export type ParentDriver =
  | "working_parents"
  | "traffic_avoidance"
  | "homework_support"
  | "enrichment"
  | "sports"
  | "quran";

export interface SnapshotNumbers {
  totalSchoolStudents: number;
  ascEnrolments: number;
  penetrationRate: number; // 0..1
}

export interface SnapshotStarter {
  numbers: SnapshotNumbers;
  parentDrivers: ParentDriver[];
  programmeFocus: string;
}

export const CENTRE_AVATAR_STARTER_DATA: Record<string, SnapshotStarter> = {
  // NSW
  "Amana OSHC MFIS Greenacre": {
    numbers: { totalSchoolStudents: 1000, ascEnrolments: 50, penetrationRate: 0.05 },
    parentDrivers: ["homework_support"],
    programmeFocus: "Homework Heroes",
  },
  "Amana OSHC MFIS Hoxton Park": {
    numbers: { totalSchoolStudents: 400, ascEnrolments: 35, penetrationRate: 0.088 },
    parentDrivers: ["traffic_avoidance", "quran"],
    programmeFocus: "Imagination Station",
  },
  "Amana OSHC MFIS Beaumont Hills": {
    numbers: { totalSchoolStudents: 220, ascEnrolments: 22, penetrationRate: 0.1 },
    parentDrivers: ["working_parents"],
    programmeFocus: "Homework Heroes",
  },
  "Amana OSHC Arkana College": {
    numbers: { totalSchoolStudents: 250, ascEnrolments: 10, penetrationRate: 0.04 },
    parentDrivers: ["enrichment"],
    programmeFocus: "Imagination Station",
  },
  "Amana OSHC Unity Grammar": {
    numbers: { totalSchoolStudents: 800, ascEnrolments: 30, penetrationRate: 0.0375 },
    parentDrivers: ["enrichment", "quran"],
    programmeFocus: "Imagination Station",
  },

  // VIC
  "Amana OSHC Al-Taqwa College": {
    numbers: { totalSchoolStudents: 1100, ascEnrolments: 20, penetrationRate: 0.018 },
    parentDrivers: ["working_parents", "traffic_avoidance", "homework_support"],
    programmeFocus: "Iqra Circle",
  },
  "Amana OSHC Minaret Officer": {
    numbers: { totalSchoolStudents: 900, ascEnrolments: 12, penetrationRate: 0.013 },
    parentDrivers: ["working_parents", "sports", "quran"],
    programmeFocus: "Iqra Circle",
  },
  "Amana OSHC Minaret Springvale": {
    numbers: { totalSchoolStudents: 900, ascEnrolments: 4, penetrationRate: 0.0044 },
    parentDrivers: ["quran", "homework_support", "sports"],
    programmeFocus: "Iqra Circle",
  },
  "Amana OSHC Minaret Doveton": {
    numbers: { totalSchoolStudents: 500, ascEnrolments: 8, penetrationRate: 0.016 },
    parentDrivers: ["working_parents", "quran"],
    programmeFocus: "Homework Heroes",
  },
  "Amana OSHC AIA KKCC": {
    numbers: { totalSchoolStudents: 500, ascEnrolments: 19, penetrationRate: 0.038 },
    parentDrivers: ["homework_support", "quran"],
    programmeFocus: "Homework Heroes",
  },
};

/**
 * Human-readable labels for parent driver enum values. Used by UI pills and
 * copy-paste prompts.
 */
export const PARENT_DRIVER_LABELS: Record<ParentDriver, string> = {
  working_parents: "Working parents",
  traffic_avoidance: "Traffic avoidance",
  homework_support: "Homework support",
  enrichment: "Enrichment / activities",
  sports: "Sports",
  quran: "Quran / faith education",
};
