import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Database } from "../../lib/repository.ts";

export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  class Prepared {
    sql: string;
    values: (string | number | null)[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...values: unknown[]) {
      this.values = values as (string | number | null)[];
      return this;
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null;
    }
    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.values) as T[] };
    }
    execute() {
      return {
        meta: {
          changes: Number(sqlite.prepare(this.sql).run(...this.values).changes),
        },
      };
    }
    async run() {
      return this.execute();
    }
  }
  const db = {
    prepare: (sql: string) => new Prepared(sql),
    batch: async (statements: Prepared[]) => {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as Database;
  return { db, sqlite };
}
