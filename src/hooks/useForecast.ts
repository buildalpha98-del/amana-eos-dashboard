"use client";

/**
 * useForecast — per-centre occupancy projections + enquiry-pipeline
 * conversion forecast (admin tier). Powers the Forecast view on
 * /performance and the projection alerts on /leadership.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type {
  ForecastAlert,
  OccupancyForecast,
  PipelineForecast,
  WeekPoint,
} from "@/lib/forecast";

export interface ServiceForecastData {
  serviceId: string;
  serviceName: string;
  code: string;
  capacity: number | null;
  history: WeekPoint[];
  forecast: OccupancyForecast | null;
}

export interface ForecastResponse {
  weeksAhead: number;
  services: ServiceForecastData[];
  pipeline: PipelineForecast;
  alerts: ForecastAlert[];
}

export function useForecast(weeks = 8) {
  return useQuery<ForecastResponse>({
    queryKey: ["forecast", weeks],
    queryFn: () => fetchApi<ForecastResponse>(`/api/forecast?weeks=${weeks}`),
    retry: 2,
    // Attendance history moves daily at most — cache aggressively.
    staleTime: 15 * 60_000,
  });
}
