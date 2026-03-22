"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StaggerChildrenProps {
  children: ReactNode;
  /** Base delay before first child animates (ms) */
  baseDelay?: number;
  /** Delay between each child (ms) */
  staggerDelay?: number;
  /** Animation class to apply */
  animation?: string;
  /** Additional wrapper className */
  className?: string;
  /** HTML element for the wrapper */
  as?: "div" | "ul" | "ol" | "section";
}

/**
 * Automatically applies staggered entrance animations to each child element.
 * Wraps each child in a div with opacity-0 + animation + computed delay.
 *
 * Usage:
 * ```tsx
 * <StaggerChildren>
 *   <Card>First</Card>
 *   <Card>Second</Card>
 *   <Card>Third</Card>
 * </StaggerChildren>
 * ```
 */
export function StaggerChildren({
  children,
  baseDelay = 0,
  staggerDelay = 60,
  animation = "animate-widget-in",
  className,
  as: Tag = "div",
}: StaggerChildrenProps) {
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <Tag className={className}>
      {items.map((child, i) => (
        <div
          key={isValidElement(child) && child.key ? child.key : i}
          className={cn("opacity-0", animation)}
          style={{ animationDelay: `${baseDelay + i * staggerDelay}ms` }}
        >
          {child}
        </div>
      ))}
    </Tag>
  );
}
