"use client";

import { useSession } from "next-auth/react";
import { useTeamsRedesignFlag } from "@/lib/useTeamsRedesignFlag";
import { useServices } from "@/hooks/useServices";
import { EmployeeListView } from "@/components/team/EmployeeListView";
import { LegacyTeamView } from "@/components/team/LegacyTeamView";

export default function TeamPage() {
  const teamsRedesign = useTeamsRedesignFlag();
  const { data: session } = useSession();
  const { data: services } = useServices();

  if (teamsRedesign && session?.user) {
    return (
      <EmployeeListView
        viewerRole={session.user.role ?? ""}
        services={
          services?.map((s) => ({ id: s.id, name: s.name })) ?? []
        }
      />
    );
  }

  return <LegacyTeamView />;
}
