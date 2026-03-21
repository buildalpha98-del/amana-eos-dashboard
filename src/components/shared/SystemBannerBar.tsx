"use client";

import { useState } from "react";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  PartyPopper,
  X,
  ExternalLink,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Banner {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "warning" | "feature" | "celebration";
  linkUrl?: string | null;
  linkLabel?: string | null;
  dismissible?: boolean;
}

const TYPE_CONFIG = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: Info,
  },
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    icon: CheckCircle2,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: AlertTriangle,
  },
  feature: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-800",
    icon: Sparkles,
  },
  celebration: {
    bg: "bg-purple-50",
    border: "border-purple-300",
    text: "text-purple-800",
    icon: PartyPopper,
  },
} as const;

export function SystemBannerBar() {
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState<string | null>(null);

  const { data } = useQuery<{ banners: Banner[] }>({
    queryKey: ["system-banners"],
    queryFn: async () => {
      const res = await fetch("/api/system-banners");
      if (!res.ok) throw new Error("Failed to load banners");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (bannerId: string) => {
      const res = await fetch(`/api/system-banners/${bannerId}/dismiss`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to dismiss banner");
      return res.json();
    },
    onMutate: (bannerId) => {
      setDismissing(bannerId);
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["system-banners"] });
        setDismissing(null);
      }, 300);
    },
    onError: () => {
      setDismissing(null);
    },
  });

  const banners = data?.banners ?? [];

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {banners.map((banner) => {
        const config = TYPE_CONFIG[banner.type] ?? TYPE_CONFIG.info;
        const Icon = config.icon;
        const isDismissing = dismissing === banner.id;
        const isDismissible = banner.dismissible !== false;
        const isInternal = banner.linkUrl?.startsWith("/");

        return (
          <div
            key={banner.id}
            className={cn(
              "rounded-lg border px-4 py-3 transition-all duration-300",
              config.bg,
              config.border,
              isDismissing && "opacity-0 translate-y-[-8px]",
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", config.text)} />

              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold", config.text)}>
                  {banner.title}
                </p>
                <p className={cn("mt-0.5 text-sm", config.text, "opacity-80")}>
                  {banner.body}
                </p>
                {banner.linkUrl && (
                  isInternal ? (
                    <Link
                      href={banner.linkUrl}
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2",
                        config.text,
                      )}
                    >
                      {banner.linkLabel || "Learn more"}
                    </Link>
                  ) : (
                    <a
                      href={banner.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2",
                        config.text,
                      )}
                    >
                      {banner.linkLabel || "Learn more"}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )
                )}
              </div>

              {isDismissible && (
                <button
                  onClick={() => dismissMutation.mutate(banner.id)}
                  disabled={dismissMutation.isPending}
                  className={cn(
                    "flex-shrink-0 rounded-md p-1 transition-colors",
                    config.text,
                    "hover:bg-black/5",
                  )}
                  aria-label="Dismiss banner"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
