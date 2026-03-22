"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  BookOpen,
  Shield,
  AlertTriangle,
  ClipboardList,
  Mail,
  GitBranch,
  BarChart3,
  Play,
  Bell,
} from "lucide-react";
import { toast } from "@/hooks/useToast";

interface SeedEndpoint {
  key: string;
  name: string;
  description: string;
  endpoint: string;
  icon: React.ReactNode;
}

type SeedStatus = "idle" | "loading" | "success" | "error";

interface SeedResult {
  status: SeedStatus;
  message?: string;
  created?: number;
}

const SEED_ENDPOINTS: SeedEndpoint[] = [
  {
    key: "knowledge-base",
    name: "Knowledge Base Articles",
    description: "34 help articles across 6 categories",
    endpoint: "/api/knowledge-base/seed",
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    key: "policies",
    name: "OSHC Policies",
    description: "20 NQS-aligned policies across 5 categories",
    endpoint: "/api/policies/seed",
    icon: <Shield className="w-5 h-5" />,
  },
  {
    key: "incidents",
    name: "Incident Protocols",
    description: "5 incident response protocol guides",
    endpoint: "/api/incidents/seed",
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  {
    key: "checklists",
    name: "Daily Checklists",
    description: "Morning, evening, and weekly checklists per centre",
    endpoint: "/api/services/checklists/seed",
    icon: <ClipboardList className="w-5 h-5" />,
  },
  {
    key: "email-templates",
    name: "Email Templates",
    description: "8 default parent-facing email templates",
    endpoint: "/api/email-templates/seed",
    icon: <Mail className="w-5 h-5" />,
  },
  {
    key: "sequences",
    name: "Nurture Sequences",
    description: "7 parent nurture and CRM outreach sequences",
    endpoint: "/api/sequences/seed",
    icon: <GitBranch className="w-5 h-5" />,
  },
  {
    key: "scorecard",
    name: "Scorecard Measurables",
    description: "Default OSHC measurables per centre",
    endpoint: "/api/scorecard/seed",
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    key: "notification-prefs",
    name: "Notification Preferences",
    description: "Backfill role-based default prefs for users missing them",
    endpoint: "/api/users/backfill-prefs",
    icon: <Bell className="w-5 h-5" />,
  },
];

export default function SeedPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [results, setResults] = useState<Record<string, SeedResult>>({});
  const [seedingAll, setSeedingAll] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const userRole = session?.user?.role;
  const isAdmin = userRole === "owner" || userRole === "admin";

  if (sessionStatus === "loading") {
    return (
      <div className="max-w-4xl mx-auto py-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <Shield className="w-10 h-10 text-muted mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Access Denied</h2>
          <p className="text-sm text-muted">Only owners and admins can access this page.</p>
        </div>
      </div>
    );
  }

  async function runSeed(endpoint: SeedEndpoint): Promise<SeedResult> {
    setResults((prev) => ({
      ...prev,
      [endpoint.key]: { status: "loading" },
    }));

    try {
      const res = await fetch(endpoint.endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        const result: SeedResult = {
          status: "error",
          message: data.error || `Failed (${res.status})`,
        };
        setResults((prev) => ({ ...prev, [endpoint.key]: result }));
        toast({ description: `${endpoint.name}: ${result.message}` });
        return result;
      }

      // Normalize created count from varying response formats
      let created = 0;
      if (typeof data.created === "number") {
        created = data.created;
      } else if (Array.isArray(data.created)) {
        created = data.created.length;
      } else if (typeof data.count === "number") {
        created = data.count;
      } else if (typeof data.total === "number") {
        created = data.total;
      }

      const msg = data.message || `Seeded ${created} items`;
      const result: SeedResult = { status: "success", message: msg, created };
      setResults((prev) => ({ ...prev, [endpoint.key]: result }));
      toast({ description: `${endpoint.name}: ${msg}` });
      return result;
    } catch (err) {
      const result: SeedResult = {
        status: "error",
        message: "Network error",
      };
      setResults((prev) => ({ ...prev, [endpoint.key]: result }));
      toast({ description: `${endpoint.name}: Network error` });
      return result;
    }
  }

  async function seedAll() {
    setSeedingAll(true);
    setCompletedCount(0);
    setResults({});

    for (let i = 0; i < SEED_ENDPOINTS.length; i++) {
      await runSeed(SEED_ENDPOINTS[i]);
      setCompletedCount(i + 1);
    }

    setSeedingAll(false);
    toast({ description: "All seed operations complete" });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/settings")}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-brand" />
              <h1 className="text-xl font-bold text-foreground">
                Seed Template Data
              </h1>
            </div>
            <p className="text-sm text-muted max-w-lg">
              Populate the dashboard with default templates, policies, and
              guides. Safe to run multiple times — duplicates are skipped.
            </p>
          </div>
          <button
            onClick={seedAll}
            disabled={seedingAll}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-60 shrink-0"
          >
            {seedingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {completedCount} of {SEED_ENDPOINTS.length} complete
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Seed All
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SEED_ENDPOINTS.map((ep) => {
          const result = results[ep.key];
          const status: SeedStatus = result?.status ?? "idle";
          const isLoading = status === "loading";

          return (
            <div
              key={ep.key}
              className="bg-card rounded-xl border border-border p-6 flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface text-muted shrink-0">
                  {ep.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    {ep.name}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {ep.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto">
                {/* Status indicator */}
                <div className="text-xs">
                  {status === "idle" && (
                    <span className="text-muted">Ready</span>
                  )}
                  {status === "loading" && (
                    <span className="inline-flex items-center gap-1 text-blue-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Seeding...
                    </span>
                  )}
                  {status === "success" && (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {result?.message}
                    </span>
                  )}
                  {status === "error" && (
                    <span className="inline-flex items-center gap-1 text-red-600">
                      <XCircle className="w-3.5 h-3.5" />
                      {result?.message}
                    </span>
                  )}
                </div>

                {/* Seed button */}
                <button
                  onClick={() => runSeed(ep)}
                  disabled={isLoading || seedingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground/80 hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                  Seed
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
