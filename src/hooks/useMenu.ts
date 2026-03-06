import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface MenuItemData {
  id?: string;
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  slot: "morning_tea" | "lunch" | "afternoon_tea";
  description: string;
  allergens: string[];
}

export interface MenuWeekData {
  id: string;
  serviceId: string;
  weekStart: string;
  notes: string | null;
  fileUrl: string | null;
  fileName: string | null;
  items: MenuItemData[];
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveMenuInput {
  weekStart: string;
  notes?: string;
  fileUrl?: string | null;
  fileName?: string | null;
  items: {
    day: string;
    slot: string;
    description: string;
    allergens?: string[];
  }[];
}

export function useMenuWeek(serviceId: string, weekStart: string) {
  return useQuery<MenuWeekData | null>({
    queryKey: ["menu-week", serviceId, weekStart],
    queryFn: async () => {
      const res = await fetch(
        `/api/services/${serviceId}/menus?weekStart=${weekStart}`
      );
      if (!res.ok) throw new Error("Failed to fetch menu");
      return res.json();
    },
    enabled: !!serviceId && !!weekStart,
  });
}

export function useSaveMenu(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: SaveMenuInput) => {
      const res = await fetch(`/api/services/${serviceId}/menus`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save menu");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-week", serviceId] });
    },
  });
}

export function useUploadMenuFile(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      weekStart,
    }: {
      file: File;
      weekStart: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("weekStart", weekStart);

      const res = await fetch(`/api/services/${serviceId}/menus/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to upload menu file");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-week", serviceId] });
    },
  });
}
