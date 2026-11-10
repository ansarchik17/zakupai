import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";
import { findFreePort } from "./local-runtime.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--port")) {
  throw new Error("Запуск: npm run local -- --port 3000");
}
const port = await findFreePort(args.length ? Number(args[1]) : 3000);
console.log(
  `ZakupAI: подготовка локальной базы. Адрес: http://localhost:${port}`,
);
const migration = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "wrangler.local.json",
    "--persist-to",
    ".wrangler/localhost",
  ],
  { cwd: projectRoot, input: "y\n", stdio: ["pipe", "inherit", "inherit"] },
);
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

process.env.VITE_ZAKUPAI_LOCAL_PREVIEW = "1";
const framework = new URL("./run-framework.mjs", import.meta.url);
process.argv = [
  process.execPath,
  fileURLToPath(framework),
  "dev",
  "--port",
  String(port),
  "--hostname",
  "127.0.0.1",
];
await import(framework.href);
