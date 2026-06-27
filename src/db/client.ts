import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not configured. Database-backed bot commands will fail until it is set.");
}

const connectionString = process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/hit6";

// Pick the driver based on the database host:
//  - Neon (*.neon.tech) uses the serverless HTTP driver — ideal for Vercel functions.
//  - Any other Postgres host (Supabase, Render Postgres, local) uses postgres-js.
// Force a driver with DB_DRIVER=neon | postgres if auto-detection is wrong.
const driver = process.env.DB_DRIVER ?? (/neon\.tech/i.test(connectionString) ? "neon" : "postgres");

function createDb(): NeonHttpDatabase<typeof schema> {
  if (driver === "neon") {
    return drizzleNeon(neon(connectionString), { schema });
  }
  // prepare:false keeps us compatible with transaction-mode poolers such as
  // Supabase's pgBouncer endpoint on port 6543 (and Neon's pooled endpoint).
  const client = postgres(connectionString, { prepare: false, max: process.env.VERCEL ? 1 : 10 });
  // postgres-js and neon-http both implement the same Drizzle PgDatabase API; the
  // cast lets the rest of the app depend on a single database type.
  return drizzlePostgres(client, { schema }) as unknown as NeonHttpDatabase<typeof schema>;
}

export const db = createDb();
