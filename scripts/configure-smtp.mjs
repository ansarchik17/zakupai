import { readFile, writeFile, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";

const settings = parseEnv(await readFile(".env.smtp", "utf8"));
let existingText = "";
try {
  existingText = await readFile(".dev.vars", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const existing = parseEnv(existingText);
const values = {
  SMTP_HOST: settings.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: settings.SMTP_PORT || "587",
  SMTP_USERNAME: settings.SMTP_USERNAME || settings.SMTP_USER || "",
  SMTP_PASSWORD: settings.SMTP_PASSWORD || "",
  SMTP_FROM_EMAIL: settings.SMTP_FROM_EMAIL || settings.SMTP_USERNAME || "",
  SMTP_FROM_NAME: settings.SMTP_FROM_NAME || "ZakupAI",
  SMTP_USE_TLS: settings.SMTP_USE_TLS || "true",
  SMTP_IMPLICIT_TLS: settings.SMTP_IMPLICIT_TLS || "false",
  SMTP_SKIP_TLS_VERIFY: "false",
  EMAIL_CODE_SECRET:
    existing.EMAIL_CODE_SECRET || randomBytes(32).toString("hex"),
};
const keys = new Set(Object.keys(values));
const lines = existingText
  .split("\n")
  .filter((line) => !keys.has(line.split("=", 1)[0]) && line.trim());
for (const [key, value] of Object.entries(values))
  lines.push(`${key}=${JSON.stringify(value)}`);
await writeFile(".dev.vars", lines.join("\n") + "\n", { mode: 0o600 });
await chmod(".dev.vars", 0o600);
await chmod(".env.smtp", 0o600);
if (process.argv.includes("--emit-config"))
  process.stdout.write(JSON.stringify(values));
else
  console.log(
    JSON.stringify({
      configured: Boolean(values.SMTP_PASSWORD),
      sender: values.SMTP_FROM_EMAIL,
      passwordSaved: Boolean(values.SMTP_PASSWORD),
    }),
  );
