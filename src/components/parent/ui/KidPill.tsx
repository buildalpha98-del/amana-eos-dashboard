"use client";

import Link from "next/link";
import { Avatar } from "./Avatar";
import { StatusBadge, type StatusVariant } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface KidPillProps {
  child: { id: string; name: string; subtitle?: string };
  status?: StatusVariant;
  href?: string;
  onPress?: () => void;
  className?: string;
}

export function KidPill({ child, status, href, onPress, className }: KidPillProps) {
  const content = (
    <div className={cn("warm-card flex items-center gap-3", className)}>
      <Avatar name={child.name} seed={child.id} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-[color:var(--color-foreground)] truncate">
          {child.name}
        </div>
        {child.subtitle && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">
            {child.subtitle}
          </div>
        )}
      </div>
      {status && <StatusBadge variant={status} />}
    </div>
  );

  if (href) return <Link href={href} className="block">{content}</Link>;
  if (onPress)
    return (
      <button type="button" onClick={onPress} className="block w-full text-left">
        {content}
      </button>
    );
  return content;
}
