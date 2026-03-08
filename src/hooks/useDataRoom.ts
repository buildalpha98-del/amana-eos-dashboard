"use client";

import { useQuery } from "@tanstack/react-query";
import type { DocumentStatus } from "@/lib/data-room-config";

export interface DataRoomItem {
  key: string;
  label: string;
  status: DocumentStatus;
  count: number;
  lastUpdated: string | null;
}

export interface DataRoomSection {
  key: string;
  label: string;
  weight: number;
  documentCount: number;
  completeness: number;
  presentCount: number;
  totalRequired: number;
  items: DataRoomItem[];
  lastUpdated: string | null;
}

export interface DataRoomResponse {
  overallScore: number;
  sections: DataRoomSection[];
  generatedAt: string;
}

export function useDataRoom() {
  return useQuery<DataRoomResponse>({
    queryKey: ["data-room"],
    queryFn: async () => {
      const res = await fetch("/api/data-room");
      if (!res.ok) throw new Error("Failed to fetch data room");
      return res.json();
    },
    staleTime: 60_000,
  });
}
