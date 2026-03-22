"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { QuickAddProvider } from "@/components/quick-add/QuickAddProvider";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import { SystemBannerBar } from "@/components/shared/SystemBannerBar";
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";
import { PWAInstallPrompt } from "@/components/shared/PWAInstallPrompt";
import { OnboardingTourWrapper } from "@/components/shared/OnboardingTourWrapper";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <QuickAddProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </QuickAddProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen">
      <NavigationProgress />
      {/* Skip to main content — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:p-4 focus:bg-brand focus:text-white focus:rounded-lg focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>

      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* Mobile header — single compact bar replacing the old dual-header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-12 bg-background border-b border-border z-30 flex items-center justify-between px-3">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="p-2 -ml-1 rounded-lg text-foreground/70 hover:bg-surface transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <Image
            src="/logo-icon-white.svg"
            alt="Amana OSHC logo"
            width={16}
            height={22}
            className="invert"
          />
          <span className="text-xs font-heading font-semibold text-foreground">Amana</span>
        </div>
        {/* Spacer — replaced by nothing, right side is empty (search/add moved to TopBar mobile sub-header which is now scrollable) */}
        <div className="w-8" />
      </div>

      <div
        className={cn(
          "pt-12 md:pt-0 transition-all duration-300",
          collapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <TopBar />
        <main id="main-content" className="p-4 md:p-8 pb-20 md:pb-8 animate-slide-up">
          <SystemBannerBar />
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <FeedbackWidget />
        <PWAInstallPrompt />
        <OfflineIndicator />
        <OnboardingTourWrapper />
        <KeyboardShortcuts />
      </div>
      <MobileTabBar onMorePress={() => setMobileNavOpen(true)} />
    </div>
  );
}
