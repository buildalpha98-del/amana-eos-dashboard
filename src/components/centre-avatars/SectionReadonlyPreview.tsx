"use client";

import { SectionReadonly } from "./SectionReadonly";
import type { ParentAvatar } from "@/lib/centre-avatar/sections";

/**
 * Thin wrapper around SectionReadonly used by the AI generate modal to
 * render a proposed parent avatar before the user applies it.
 */
export function ParentAvatarReadonlyPreview({ value }: { value: ParentAvatar }) {
  return <SectionReadonly sectionKey="parentAvatar" content={value} />;
}
