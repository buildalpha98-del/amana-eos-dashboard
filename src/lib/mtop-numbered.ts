/**
 * The five MTOP learning outcomes as numbered on program activities and
 * Activity Library entries (`mtopOutcomes: number[]`, 1–5). One list for the
 * Program tab and the Library so the labels and colours never drift.
 */
export const MTOP_OUTCOMES = [
  { id: 1, label: "Identity", short: "O1", color: "bg-blue-500" },
  { id: 2, label: "Connected", short: "O2", color: "bg-green-500" },
  { id: 3, label: "Wellbeing", short: "O3", color: "bg-orange-500" },
  { id: 4, label: "Confident Learner", short: "O4", color: "bg-purple-500" },
  { id: 5, label: "Communicator", short: "O5", color: "bg-teal-500" },
] as const;
