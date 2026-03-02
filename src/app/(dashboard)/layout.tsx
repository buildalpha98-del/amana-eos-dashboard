"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-64 transition-all duration-300">
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
