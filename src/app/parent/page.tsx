"use client";

import { PARENT_PORTAL_LOCKED } from "@/lib/parent-portal-lockdown";
import ParentHome from "./HomeV1";
import { ParentWelcomeHome } from "@/components/parent/ParentWelcomeHome";

export default function ParentPage() {
  return PARENT_PORTAL_LOCKED ? <ParentWelcomeHome /> : <ParentHome />;
}
