import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/neon-snapshot
 *
 * Daily cron: creates a Neon branch from the production branch's CURRENT
 * state, named `snapshot-YYYY-MM-DD`. Then deletes any snapshot branches
 * older than `RETENTION_DAYS`.
 *
 * Why this exists: Neon Free plan only retains 6h of PITR. If a destructive
 * deploy or accidental wipe happens, anything older than 6h is gone. A
 * daily branch snapshot extends the recovery window — branches don't
 * count against PITR and live until you delete them.
 *
 * Each branch only stores the LSN delta from its parent, so the storage
 * cost is small (KBs per day for a low-write app like this one).
 *
 * Required env vars:
 *   - NEON_API_KEY     (control-plane Bearer token, starts with `napi_`)
 *   - NEON_PROJECT_ID  (e.g. `old-cake-04884580`)
 *   - CRON_SECRET      (verified by verifyCronSecret)
 *
 * Schedule: daily at 14:00 UTC (00:00 AEST). Wired in vercel.json.
 */

const RETENTION_DAYS = 14;
const SNAPSHOT_PREFIX = "snapshot-";
const NEON_API_BASE = "https://console.neon.tech/api/v2";

interface NeonBranch {
  id: string;
  name: string;
  primary?: boolean;
  default?: boolean;
  protected?: boolean;
  created_at: string;
}

async function neonFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) throw new Error("NEON_API_KEY is not set");
  return fetch(`${NEON_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function listBranches(projectId: string): Promise<NeonBranch[]> {
  const res = await neonFetch(`/projects/${projectId}/branches`);
  if (!res.ok) {
    throw new Error(`Neon list branches failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { branches: NeonBranch[] };
  return json.branches;
}

async function createSnapshotBranch(projectId: string, name: string): Promise<NeonBranch> {
  // No `parent_timestamp` => creates from the parent branch's HEAD (i.e. now).
  // No endpoints => storage-only branch (no compute cost).
  const res = await neonFetch(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({ branch: { name } }),
  });
  if (!res.ok) {
    throw new Error(`Neon create branch failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { branch: NeonBranch };
  return json.branch;
}

async function deleteBranch(projectId: string, branchId: string): Promise<void> {
  const res = await neonFetch(`/projects/${projectId}/branches/${branchId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Neon delete branch ${branchId} failed: ${res.status} ${await res.text()}`);
  }
}

function todaySnapshotName(now: Date = new Date()): string {
  // YYYY-MM-DD in UTC. One snapshot per UTC day.
  const iso = now.toISOString().split("T")[0];
  return `${SNAPSHOT_PREFIX}${iso}`;
}

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("neon-snapshot", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const projectId = process.env.NEON_PROJECT_ID;
    if (!projectId) throw new Error("NEON_PROJECT_ID is not set");

    const branches = await listBranches(projectId);
    const todayName = todaySnapshotName();

    // Idempotency: skip if today's snapshot already exists.
    const existingToday = branches.find((b) => b.name === todayName);
    let createdId: string | null = null;
    if (existingToday) {
      logger.info("Neon snapshot already exists for today", {
        name: todayName,
        branchId: existingToday.id,
      });
    } else {
      const created = await createSnapshotBranch(projectId, todayName);
      createdId = created.id;
      logger.info("Neon snapshot branch created", {
        name: todayName,
        branchId: created.id,
      });
    }

    // Reap snapshots older than RETENTION_DAYS. Be defensive: only touch
    // branches whose name starts with our prefix and are NOT the default
    // production branch. Re-list so we don't try to delete what we just
    // created.
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const fresh = createdId ? await listBranches(projectId) : branches;
    const toDelete = fresh.filter((b) => {
      if (b.primary || b.default || b.protected) return false;
      if (!b.name.startsWith(SNAPSHOT_PREFIX)) return false;
      const created = Date.parse(b.created_at);
      return Number.isFinite(created) && created < cutoffMs;
    });

    let deleted = 0;
    const deleteErrors: Array<{ id: string; error: string }> = [];
    for (const b of toDelete) {
      try {
        await deleteBranch(projectId, b.id);
        deleted += 1;
      } catch (err) {
        deleteErrors.push({
          id: b.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (deleteErrors.length > 0) {
      logger.warn("Neon snapshot cleanup had errors", { deleteErrors });
    }

    const result = {
      created: createdId,
      todaySnapshotAlreadyExisted: !!existingToday,
      retentionDays: RETENTION_DAYS,
      deletedCount: deleted,
      deleteErrors,
    };

    await guard.complete(result);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
