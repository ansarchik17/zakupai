import { env } from "cloudflare:workers";
import type { Database } from "./repository";

export function database() {
  if (!env.DB) throw new Error("DB binding missing");
  return env.DB as unknown as Database;
}
