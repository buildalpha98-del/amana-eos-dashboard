/**
 * Integration test setup — runs against a real test database.
 *
 * Requires DATABASE_URL in .env.test pointing to a test PostgreSQL instance.
 */

import { config } from "dotenv";
config({ path: ".env.test" });
