"use client";

import { useSession } from "next-auth/react";
import { useServices } from "@/hooks/useServices";
import { EmployeeListView } from "@/components/team/EmployeeListView";

export default function TeamPage() {
  const { data: session } = useSession();
  const { data: services } = useServices();

  if (!session?.user) return null;

  return (
    <EmployeeListView
      viewerRole={session.user.role ?? ""}
      services={services?.map((s) => ({ id: s.id, name: s.name })) ?? []}
    />
  );
}
