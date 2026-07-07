/**
 * Pure gating logic for the immersive course player. Kept separate from the
 * React component so it can be unit-tested.
 */

export type PlayerModuleType =
  | "document"
  | "video"
  | "quiz"
  | "checklist"
  | "external_link";

/**
 * Minimum dwell time before a reading/video module unlocks "Next".
 *
 * An anti-skip floor so a learner can't scroll to the bottom and click through
 * instantly. `duration` is an author estimate (minutes) shown in the UI; we do
 * not force the whole estimate — 60s is enough to prevent instant skipping.
 */
export function requiredSecondsOnPage(_module: { duration?: number | null }): number {
  return 60;
}

/**
 * Can the learner advance past this module?
 * - quiz: only once passed (or already recorded complete).
 * - document/video/checklist/link: once already complete, or the dwell floor met.
 */
export function canAdvanceModule(
  module: { type: PlayerModuleType; duration?: number | null },
  opts: { timeOnPageSec: number; quizPassed: boolean; alreadyComplete: boolean },
): boolean {
  if (module.type === "quiz") {
    return opts.quizPassed || opts.alreadyComplete;
  }
  if (opts.alreadyComplete) return true;
  return opts.timeOnPageSec >= requiredSecondsOnPage(module);
}

/**
 * Convert an author-pasted video URL into an embeddable URL on a host the LMS
 * sanitizer permits (youtube-nocookie / player.vimeo / loom embed). Returns
 * null if it isn't a recognised provider.
 */
export function toVideoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  // YouTube: watch?v=, youtu.be/ID, or already /embed/
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname.startsWith("/embed/")) {
      return `https://www.youtube-nocookie.com${u.pathname}`;
    }
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
  }
  // Vimeo: vimeo.com/ID or player.vimeo.com/video/ID
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id) return `https://player.vimeo.com/video/${id}`;
  }
  if (host === "player.vimeo.com") return `https://player.vimeo.com${u.pathname}`;
  // Loom: loom.com/share/ID or loom.com/embed/ID
  if (host === "loom.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    if (id) return `https://www.loom.com/embed/${id}`;
  }
  return null;
}

/** Index of the first not-yet-complete module (for resume), or 0 if all done. */
export function firstIncompleteIndex(
  modules: { id: string }[],
  completedIds: Set<string>,
): number {
  const idx = modules.findIndex((m) => !completedIds.has(m.id));
  return idx === -1 ? 0 : idx;
}
