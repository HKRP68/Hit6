import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not configured. Database-backed bot commands will fail until it is set.");
}

neonConfig.fetchConnectionCache = true;

const sql = neon(process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/hit6");
export const db = drizzle(sql, { schema });
