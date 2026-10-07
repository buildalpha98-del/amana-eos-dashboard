"use client";

/**
 * "Staff files" on /documents (admins, 2026-10-08): one folder per staff
 * member, built automatically from their contracts, certificates and
 * assigned documents (GET /api/documents/staff-folders). Replaces those
 * files being scattered through the main library.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, FileSignature, FileText, Folder, Search } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";

interface StaffFolder {
  userId: string;
  name: string;
  avatar: string | null;
  active: boolean;
  serviceName: string | null;
  documents: number;
  certificates: number;
  contracts: number;
  total: number;
}

interface FolderItem {
  kind: "contract" | "certificate" | "document";
  id: string;
  title: string;
  detail: string;
  date: string;
  href: string;
}

const initials = (name: string) =>
  name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function StaffFilesBrowser({ onBack }: { onBack: () => void }) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery<{ folders: StaffFolder[] }>({
    queryKey: ["staff-folders"],
    queryFn: () => fetchApi("/api/documents/staff-folders"),
    staleTime: 60_000,
    retry: 2,
  });

  const folders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.folders ?? []).filter(
      (f) => !q || f.name.toLowerCase().includes(q) || (f.serviceName ?? "").toLowerCase().includes(q),
    );
  }, [data, query]);

  if (openUserId) {
    return <StaffFolderView userId={openUserId} onBack={() => setOpenUserId(null)} />;
  }

  return (
    <div className="space-y-4" data-testid="staff-files">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden /> All documents
        </button>
        <h2 className="text-base font-semibold text-foreground">Staff files</h2>
        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Find a staff member</span>
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a staff member or centre"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : folders.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No staff files yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {folders.map((f) => (
            <button
              key={f.userId}
              type="button"
              onClick={() => setOpenUserId(f.userId)}
              className="text-left bg-card rounded-lg border border-border p-3 hover:shadow-md hover:border-brand/30 transition-all"
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-8 h-8 shrink-0 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">
                  {initials(f.name)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{f.name}</span>
                  <span className="block text-2xs text-muted truncate">
                    {f.active ? f.serviceName ?? "No centre" : "Former staff"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-muted">
                {f.total} file{f.total === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const KIND = {
  contract: { label: "Contracts", icon: FileSignature },
  certificate: { label: "Certificates", icon: Award },
  document: { label: "Other documents", icon: FileText },
} as const;

function StaffFolderView({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { data, isLoading } = useQuery<{ user: { name: string; serviceName: string | null }; items: FolderItem[] }>({
    queryKey: ["staff-folder", userId],
    queryFn: () => fetchApi(`/api/documents/staff-folders/${userId}`),
    staleTime: 60_000,
    retry: 2,
  });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden /> Staff files
      </button>
      <div className="flex items-center gap-2">
        <Folder className="w-5 h-5 text-brand" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">{data?.user.name ?? "…"}</h2>
        {data?.user.serviceName && <span className="text-sm text-muted">· {data.user.serviceName}</span>}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : (
        (["contract", "certificate", "document"] as const).map((kind) => {
          const items = (data?.items ?? []).filter((i) => i.kind === kind);
          if (items.length === 0) return null;
          const Icon = KIND[kind].icon;
          return (
            <section key={kind}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {KIND[kind].label} ({items.length})
              </h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {items.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <a
                      href={i.href}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-3 p-3 hover:bg-surface transition-colors"
                    >
                      <Icon className="w-4 h-4 text-brand shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground truncate capitalize">{i.title}</span>
                        <span className="block text-xs text-muted capitalize">{i.detail}</span>
                      </span>
                      <span className="text-xs text-muted shrink-0">
                        {new Date(i.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
