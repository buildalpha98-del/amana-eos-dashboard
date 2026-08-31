// Guard: refuse to run a destructive Prisma command against PRODUCTION.
//
// Wired into the `db:push` and `db:migrate` npm scripts. Local development must
// point at a Neon *dev branch*, never the production endpoint. On 2026-07-07 a
// destructive command run with the prod DATABASE_URL loaded wiped production.
//
// The check keys on the production Neon endpoint host, so a dev branch (a
// different ep-… host on neon.tech) passes freely. Intentional prod use:
//   ALLOW_PROD_DB=yes npm run <script>
import { readFileSync, existsSync } from "node:fs";

const PROD_HOST = "ep-green-breeze-angq0yoa"; // Amana production Neon endpoint

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

const url = resolveDatabaseUrl();
if (url.includes(PROD_HOST) && process.env.ALLOW_PROD_DB !== "yes") {
  console.error(
    "\n⛔ Blocked: DATABASE_URL points at PRODUCTION (" + PROD_HOST + ").\n" +
      "   Local dev must use a Neon dev branch. If you really mean prod, run with:\n" +
      "   ALLOW_PROD_DB=yes <your command>\n",
  );
  process.exit(1);
}
