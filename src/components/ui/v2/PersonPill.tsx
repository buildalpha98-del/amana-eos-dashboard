"use client";

import Link from "next/link";
import { Avatar } from "./Avatar";
import { StatusBadge, type StatusVariant } from "./StatusBadge";
import { cn } from "@/lib/utils";

export interface PersonPillProps {
  /** Generic — kids, educators, parents, any person. Fields named loosely. */
  person: { id: string; name: string; subtitle?: string };
  status?: StatusVariant;
  href?: string;
  onPress?: () => void;
  className?: string;
}

export function PersonPill({
  person,
  status,
  href,
  onPress,
  className,
}: PersonPillProps) {
  const content = (
    <div className={cn("warm-card flex items-center gap-3", className)}>
      <Avatar name={person.name} seed={person.id} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-[color:var(--color-foreground)] truncate">
          {person.name}
        </div>
        {person.subtitle && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">
            {person.subtitle}
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

/**
 * @deprecated Use `PersonPill` directly. `KidPill` is kept for BC with parent
 * portal imports that use `child: {...}` as the prop name. New code should
 * import `PersonPill` from `@/components/ui/v2`.
 */
export function KidPill({
  child,
  status,
  href,
  onPress,
  className,
}: {
  child: { id: string; name: string; subtitle?: string };
  status?: StatusVariant;
  href?: string;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <PersonPill
      person={child}
      status={status}
      href={href}
      onPress={onPress}
      className={className}
    />
  );
}
