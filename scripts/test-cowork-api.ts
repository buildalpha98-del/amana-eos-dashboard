/**
 * Test script for Cowork API endpoints.
 * Usage: npx tsx scripts/test-cowork-api.ts
 *
 * Reads COWORK_API_KEY from .env.local.
 * Set BASE_URL env var to test against production.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Config ───────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

function loadApiKey(): string {
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/^COWORK_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  if (process.env.COWORK_API_KEY) return process.env.COWORK_API_KEY;
  throw new Error("COWORK_API_KEY not found in .env.local or environment");
}

const API_KEY = loadApiKey();
let passed = 0;
let failed = 0;

// ── Helpers ──────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function apiNoAuth(method: string, path: string, body?: unknown) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── Tests ────────────────────────────────────────────────────

async function testAuth() {
  console.log("\n🔐 Authentication");
  const { status } = await apiNoAuth("GET", "/api/cowork/programs");
  assert("Rejects request without API key", status === 401);

  const { status: s2 } = await api("GET", "/api/cowork/programs", undefined, {
    Authorization: "Bearer wrong-key",
  });
  assert("Rejects request with wrong API key", s2 === 401);

  const { status: s3 } = await api("GET", "/api/cowork/programs");
  assert("Accepts request with valid API key", s3 === 200);
}

async function testPrograms() {
  console.log("\n📋 Programs");

  // Validation: missing required fields
  const { status: s1 } = await api("POST", "/api/cowork/programs", {
    theme: "Test",
  });
  assert("Rejects program without programFile", s1 === 400);

  // Create program
  const sampleFile = Buffer.from("Hello World - test program file").toString("base64");
  const { status: s2, json: created } = await api("POST", "/api/cowork/programs", {
    weekCommencing: "2026-03-09",
    theme: "Ocean Explorers",
    category: "Science & Nature",
    summary: "This week children explore ocean ecosystems through art and science.",
    programFile: { filename: "Program-Week-2026-03-09.docx", data: sampleFile },
    resourceFile: { filename: "Resources-Week-2026-03-09.docx", data: sampleFile },
  });
  assert("Creates program (201)", s2 === 201);
  assert("Program has ID", !!created?.id);
  assert("Program has programFileUrl", !!created?.programFileUrl);

  // Idempotent upsert
  const { status: s3 } = await api("POST", "/api/cowork/programs", {
    weekCommencing: "2026-03-09",
    theme: "Ocean Explorers (Updated)",
    programFile: { filename: "Program-Week-2026-03-09-v2.docx", data: sampleFile },
  });
  assert("Upserts same week without error (201)", s3 === 201);

  // GET by week
  const { status: s4, json: byWeek } = await api(
    "GET",
    "/api/cowork/programs?week=2026-03-09"
  );
  assert("GET by week returns program", s4 === 200 && byWeek?.theme?.includes("Ocean"));

  // GET recent
  const { status: s5, json: recent } = await api("GET", "/api/cowork/programs");
  assert("GET recent returns array", s5 === 200 && Array.isArray(recent));
}

async function testTodos() {
  console.log("\n✅ Todos");

  // Validation: bad centreId
  const { status: s1 } = await api("POST", "/api/cowork/todos", {
    centreId: "invalid-centre",
    date: "2026-03-09",
    todos: [{ title: "Test", category: "morning-prep" }],
  });
  assert("Rejects invalid centreId", s1 === 400);

  // Validation: bad category
  const { status: s2 } = await api("POST", "/api/cowork/todos", {
    centreId: "mfis-beaumont-hills",
    date: "2026-03-09",
    todos: [{ title: "Test", category: "invalid-cat" }],
  });
  assert("Rejects invalid category", s2 === 400);

  // Create todos
  const { status: s3, json: created } = await api("POST", "/api/cowork/todos", {
    centreId: "mfis-beaumont-hills",
    date: "2026-03-09",
    todos: [
      {
        title: "Set up Imagination Station: Watercolour ocean scenes",
        description: "Lay out watercolour sets and ocean reference images.",
        category: "afternoon-prep",
        dueTime: "15:00",
        assignedRole: "educator",
      },
      {
        title: "Prepare Little Champions equipment",
        category: "afternoon-prep",
        dueTime: "15:00",
      },
    ],
  });
  assert("Creates todos (201)", s3 === 201);
  assert("Returns 2 todos", created?.todos?.length === 2);

  const todoId = created?.todos?.[0]?.id;

  // GET todos
  const { status: s4, json: fetched } = await api(
    "GET",
    "/api/cowork/todos?centreId=mfis-beaumont-hills&date=2026-03-09"
  );
  assert("GET todos returns results", s4 === 200 && fetched?.todos?.length >= 2);

  // PATCH — mark complete
  if (todoId) {
    const { status: s5, json: updated } = await api(
      "PATCH",
      `/api/cowork/todos/${todoId}`,
      { completed: true, completedBy: "Sarah M." }
    );
    assert("PATCH marks todo complete", s5 === 200 && updated?.completed === true);
  }
}

async function testAnnouncements() {
  console.log("\n📢 Announcements");

  // Validation: missing body
  const { status: s1 } = await api("POST", "/api/cowork/announcements", {
    title: "Test",
    type: "general",
  });
  assert("Rejects announcement without body", s1 === 400);

  // Create
  const { status: s2, json: created } = await api("POST", "/api/cowork/announcements", {
    title: "Weekly Program: Ocean Explorers",
    body: "This week's program focuses on ocean ecosystems.",
    type: "program-update",
    targetCentres: ["all"],
    pinned: false,
    expiresAt: "2026-03-16",
  });
  assert("Creates announcement (201)", s2 === 201);
  assert("Announcement has ID", !!created?.id);

  // GET all
  const { status: s3, json: all } = await api("GET", "/api/cowork/announcements");
  assert("GET returns announcements", s3 === 200 && all?.announcements?.length >= 1);

  // GET filtered by centre
  const { status: s4 } = await api(
    "GET",
    "/api/cowork/announcements?centreId=mfis-beaumont-hills"
  );
  assert("GET filtered by centreId works", s4 === 200);
}

async function testCalendar() {
  console.log("\n📅 Calendar");

  // Validation: empty events array
  const { status: s1 } = await api("POST", "/api/cowork/calendar", { events: [] });
  assert("Rejects empty events array", s1 === 400);

  // Create events
  const { status: s2, json: created } = await api("POST", "/api/cowork/calendar", {
    events: [
      {
        title: "Excursion: Sydney Aquarium",
        date: "2026-03-12",
        centreId: "mfis-beaumont-hills",
        type: "excursion",
        details: "Permission forms due by 10 March.",
      },
      {
        title: "Public Holiday: Good Friday",
        date: "2026-04-03",
        centreId: null,
        type: "public-holiday",
        details: "All centres closed.",
      },
    ],
  });
  assert("Creates calendar events (201)", s2 === 201);
  assert("Returns 2 events", created?.events?.length === 2);

  // GET by month
  const { status: s3, json: byMonth } = await api(
    "GET",
    "/api/cowork/calendar?month=2026-03"
  );
  assert("GET by month returns events", s3 === 200 && byMonth?.events?.length >= 1);

  // GET by date range
  const { status: s4 } = await api(
    "GET",
    "/api/cowork/calendar?from=2026-03-01&to=2026-03-31&centreId=mfis-beaumont-hills"
  );
  assert("GET by date range + centreId works", s4 === 200);
}

// ── Run ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Testing Cowork API at ${BASE_URL}\n`);

  await testAuth();
  await testPrograms();
  await testTodos();
  await testAnnouncements();
  await testCalendar();

  console.log(`\n─────────────────────────────────────`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
