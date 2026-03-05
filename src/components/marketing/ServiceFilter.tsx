"use client";

import { useServices } from "@/hooks/useServices";

interface ServiceFilterProps {
  value: string;
  onChange: (serviceId: string) => void;
}

export function ServiceFilter({ value, onChange }: ServiceFilterProps) {
  const { data: services } = useServices("active");

  const sorted = [...(services ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white text-sm px-3 py-2 focus:ring-[#004E64] focus:border-transparent focus:outline-none focus:ring-1"
    >
      <option value="">All Centres</option>
      {sorted.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.code})
        </option>
      ))}
    </select>
  );
}
