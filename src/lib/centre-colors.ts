/**
 * Centre colour identity (2026-07-06 design system).
 *
 * Every service gets a stable, deterministic hue used wherever the
 * centre appears — dots, chips, roster rows, heatmaps — so
 * multi-centre readers stop re-reading names and start recognising
 * colour. The hash keys on the service CODE (stable, human-assigned)
 * so the colour survives id churn across environments.
 *
 * Palette: 11 visually-distinct hues at matched saturation/lightness,
 * chosen to keep AA contrast for the paired dark text tokens and to
 * avoid colliding with the attention ladder's red/amber semantics.
 */

export interface CentreColor {
  /** Solid hue for dots, bars, avatars. */
  hex: string;
  /** Tailwind classes for a tinted chip (bg + text + border). */
  chip: string;
}

const PALETTE: CentreColor[] = [
  { hex: "#0F6E56", chip: "bg-teal-50 text-teal-800 border-teal-200" },
  { hex: "#534AB7", chip: "bg-violet-50 text-violet-800 border-violet-200" },
  { hex: "#993C1D", chip: "bg-orange-50 text-orange-800 border-orange-200" },
  { hex: "#185FA5", chip: "bg-sky-50 text-sky-800 border-sky-200" },
  { hex: "#993556", chip: "bg-pink-50 text-pink-800 border-pink-200" },
  { hex: "#3B6D11", chip: "bg-lime-50 text-lime-800 border-lime-200" },
  { hex: "#0E7490", chip: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  { hex: "#7C2D92", chip: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200" },
  { hex: "#854F0B", chip: "bg-yellow-50 text-yellow-800 border-yellow-300" },
  { hex: "#3C3489", chip: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  { hex: "#0D9488", chip: "bg-emerald-50 text-emerald-800 border-emerald-200" },
];

/** Stable non-crypto hash (djb2) — same input, same colour, forever. */
function hashKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (h * 33) ^ key.charCodeAt(i);
  }
  return Math.abs(h);
}

export function centreColor(codeOrName: string): CentreColor {
  const key = (codeOrName || "?").trim().toUpperCase();
  return PALETTE[hashKey(key) % PALETTE.length];
}

export const CENTRE_PALETTE_SIZE = PALETTE.length;
