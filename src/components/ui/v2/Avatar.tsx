"use client";

import { cn } from "@/lib/utils";

// ─── Deterministic hash (djb2, 32-bit signed) ───────────
// Byte-identical on server and client — safe for SSR gradient selection.
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
    hash = hash | 0;
  }
  return Math.abs(hash);
}

// ─── Gradient presets ──────────────────────────────────
export const AVATAR_GRADIENTS = [
  { name: "teal", start: "#7FD3D9", end: "#4A9BA3" },
  { name: "peach", start: "#FFB48E", end: "#E08A5E" },
  { name: "amber", start: "#FFC94D", end: "#E89F1E" },
  { name: "sage", start: "#A8C8A8", end: "#6D9A6D" },
  { name: "rose", start: "#F4A5B5", end: "#D07089" },
  { name: "lilac", start: "#C4A8E0", end: "#8C6FB8" },
] as const;

export function gradientFor(seed: string): string {
  const preset = AVATAR_GRADIENTS[djb2(seed) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${preset.start}, ${preset.end})`;
}

// ─── Component ─────────────────────────────────────────
const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-2xl",
} as const;

interface AvatarProps {
  name: string;
  seed?: string;
  size?: keyof typeof SIZE_CLASSES;
  src?: string;
  className?: string;
}

export function Avatar({ name, seed, size = "md", src, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const resolvedSeed = seed ?? name;
  const background = gradientFor(resolvedSeed);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white overflow-hidden",
        SIZE_CLASSES[size],
        className,
      )}
      style={src ? undefined : { background }}
      aria-label={`Avatar for ${name}`}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}
