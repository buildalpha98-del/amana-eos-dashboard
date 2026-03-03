"use client";

const platformColors: Record<string, string> = {
  facebook: "bg-blue-100 text-blue-700",
  instagram: "bg-pink-100 text-pink-700",
  linkedin: "bg-sky-100 text-sky-700",
  email: "bg-amber-100 text-amber-700",
  newsletter: "bg-teal-100 text-teal-700",
  website: "bg-emerald-100 text-emerald-700",
  flyer: "bg-orange-100 text-orange-700",
};

interface PlatformBadgeProps {
  platform: string;
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const colors =
    platformColors[platform.toLowerCase()] ?? "bg-gray-100 text-gray-700";

  const label = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}
