"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { QuickAddProvider } from "@/components/quick-add/QuickAddProvider";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <QuickAddProvider>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </QuickAddProvider>
    </SidebarProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image
            src="/logo-icon-white.svg"
            alt="Amana OSHC"
            width={20}
            height={28}
            className="invert"
          />
          <span className="text-sm font-semibold text-gray-900">Amana OSHC</span>
        </div>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      <div
        className={cn(
          "pt-14 md:pt-0 transition-all duration-300",
          collapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <TopBar />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
