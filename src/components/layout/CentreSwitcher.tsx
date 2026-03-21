"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Building2, Search } from "lucide-react";
import { useServices } from "@/hooks/useServices";

const SWITCHER_ROLES = new Set(["coordinator", "admin", "head_office", "owner"]);

const SERVICE_PAGE_PREFIXES = [
  "/services",
  "/attendance",
  "/checklists",
];

function isServicePage(pathname: string): boolean {
  return SERVICE_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
}

export function CentreSwitcher() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { data: services } = useServices("active");

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const role = session?.user?.role as string | undefined;
  const isPrivilegedRole = role ? SWITCHER_ROLES.has(role) : false;
  const onServicePage = isServicePage(pathname);

  // Determine whether to show the switcher
  const shouldShow = isPrivilegedRole || onServicePage;

  // Detect current service from URL
  const currentServiceId = useMemo(() => {
    const match = pathname.match(/^\/services\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const currentService = useMemo(() => {
    if (!currentServiceId || !services) return null;
    return services.find((s) => s.id === currentServiceId) ?? null;
  }, [currentServiceId, services]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    if (!search.trim()) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.suburb && s.suburb.toLowerCase().includes(q))
    );
  }, [services, search]);

  const showSearch = (services?.length ?? 0) >= 5;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, showSearch]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
    setSearch("");
  }, [pathname]);

  if (!shouldShow) return null;

  const displayName = currentService?.name ?? "All Centres";

  function handleSelect(serviceId: string | null) {
    setOpen(false);
    setSearch("");
    if (serviceId) {
      router.push(`/services/${serviceId}`);
    } else {
      router.push("/services");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-surface border border-border rounded-lg hover:bg-card transition-colors max-w-[200px] md:max-w-[240px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{displayName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Search (desktop only, 5+ services) */}
          {showSearch && (
            <div className="p-2 border-b border-border hidden md:block">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search centres..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-surface border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {/* All Centres option */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface transition-colors ${
                !currentServiceId ? "text-brand font-semibold bg-accent/10" : "text-foreground"
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              All Centres
            </button>

            {/* Service list */}
            {filteredServices.map((service) => (
              <button
                key={service.id}
                onClick={() => handleSelect(service.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface transition-colors ${
                  service.id === currentServiceId ? "text-brand font-semibold bg-accent/10" : "text-foreground"
                }`}
              >
                <span className="truncate">{service.name}</span>
                {service.state && (
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{service.state}</span>
                )}
              </button>
            ))}

            {filteredServices.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">No centres found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
