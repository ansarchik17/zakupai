import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { parseEnv } from "node:util";
import { once } from "node:events";
import { hashPassword, randomToken } from "../lib/auth-crypto.ts";
import { findFreePort } from "../scripts/local-runtime.mjs";

// Own disposable accounts, D1 database and mailbox. Never contacts Gmail.
const email = "auth-admin@example.test",
  password = randomToken();
const mailToken = randomToken(),
  messages = [];
let server,
  dev,
  original,
  logs = "",
  succeeded = false,
  settingsOverridden = false;
const state = `.wrangler/otp-http-${crypto.randomUUID()}`;
try {
  try {
    original = await readFile(".dev.vars", "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== `Bearer ${mailToken}`) {
      response.writeHead(401);
      response.end("{}");
      return;
    }
    if (request.method === "GET" && request.url === "/inbox") {
      response.end(JSON.stringify(messages));
      return;
    }
    if (request.method !== "POST" || request.url !== "/send") {
      response.writeHead(404);
      response.end("{}");
      return;
    }
    let content = "";
    for await (const chunk of request) {
      content += chunk;
      if (content.length > 20000) {
        response.writeHead(413);
        response.end("{}");
        return;
      }
    }
    messages.push(JSON.parse(content));
    response.end('{"ok":true}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const mailUrl = `http://127.0.0.1:${server.address().port}`;
  const values = {
    ...parseEnv(original || ""),
    ZAKUPAI_ADMIN_EMAIL: email,
    ZAKUPAI_ADMIN_PASSWORD_HASH: await hashPassword(password),
    ZAKUPAI_ADMIN_NAME: "Тестовый администратор",
    SMTP_PASSWORD: "",
    SMTP_RELAY_URL: mailUrl + "/send",
    SMTP_RELAY_TOKEN: mailToken,
    EMAIL_CODE_SECRET: randomToken(),
    ZAKUPAI_PUBLIC_URL: "",
  };
  await writeFile(
    ".dev.vars",
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  settingsOverridden = true;
  const port = await findFreePort(3200),
    base = `http://127.0.0.1:${port}`;
  dev = spawn(
    process.execPath,
    ["scripts/start-local.mjs", "--port", String(port)],
    {
      env: { ...process.env, ZAKUPAI_LOCAL_STATE_DIR: state },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const capture = (chunk) => {
    logs = (logs + chunk.toString()).slice(-10000);
  };
  dev.stdout.on("data", capture);
  dev.stderr.on("data", capture);
  const readyUntil = Date.now() + 45000;
  let ready = false;
  while (Date.now() < readyUntil) {
    if (dev.exitCode !== null)
      throw new Error("Test server stopped before readiness");
    try {
      const response = await fetch(base + "/login");
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("Test server readiness timed out");
  const smoke = spawn(process.execPath, ["tests/auth-http-smoke.mjs"], {
    env: {
      ...process.env,
      ZAKUPAI_TEST_URL: base,
      ZAKUPAI_MAIL_TEST_URL: mailUrl,
      ZAKUPAI_MAIL_TEST_TOKEN: mailToken,
    },
    stdio: ["pipe", "inherit", "inherit"],
  });
  smoke.stdin.end(JSON.stringify({ email, password }) + "\n");
  const [code] = await once(smoke, "exit");
  if (code !== 0) throw new Error("Auth HTTP smoke failed");
  succeeded = true;
} catch (e) {
  console.error(e.message);
  if (logs) console.error(logs);
  process.exitCode = 1;
} finally {
  if (dev && dev.exitCode === null) {
    const stopped = once(dev, "exit");
    dev.kill("SIGTERM");
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (dev.exitCode === null) {
      dev.kill("SIGKILL");
      await stopped;
    }
  }
  if (settingsOverridden) {
    if (original === undefined) await rm(".dev.vars", { force: true });
    else await writeFile(".dev.vars", original, { mode: 0o600 });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(state, { recursive: true, force: true });
}
if (succeeded)
  console.log(
    "Isolated HTTP/OTP tests passed. Original local settings restored; no real emails sent.",
  );
