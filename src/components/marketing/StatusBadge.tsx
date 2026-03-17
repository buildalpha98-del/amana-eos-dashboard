"use client";

const campaignColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  completed: "bg-purple-100 text-purple-700",
  paused: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

const postColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-brand/10 text-brand",
  scheduled: "bg-brand/20 text-brand",
  published: "bg-green-100 text-green-700",
};

interface StatusBadgeProps {
  status: string;
  type?: "campaign" | "post";
}

export function StatusBadge({ status, type = "campaign" }: StatusBadgeProps) {
  const colorMap = type === "post" ? postColors : campaignColors;
  const colors = colorMap[status.toLowerCase()] ?? "bg-gray-100 text-gray-700";

  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}
