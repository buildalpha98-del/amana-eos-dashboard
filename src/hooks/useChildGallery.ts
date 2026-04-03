"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface GalleryImage {
  id: string;
  url: string;
  postTitle: string;
  postType: string;
  authorName: string;
  createdAt: string;
}

export function useChildGallery(childId: string) {
  return useQuery<GalleryImage[]>({
    queryKey: ["child-gallery", childId],
    queryFn: () => fetchApi<GalleryImage[]>(`/api/parent/children/${childId}/gallery`),
    enabled: !!childId,
    staleTime: 60_000,
    retry: 2,
  });
}
