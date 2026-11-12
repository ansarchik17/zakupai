import { readFile, writeFile } from "node:fs/promises";
import { hashPassword } from "../lib/auth-crypto.ts";

// Credentials are supplied through hidden stdin, never command-line arguments.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write(
  "Ready for administrator JSON on stdin (input is hidden).\n",
);
let input = "";
for await (const chunk of process.stdin) {
  input += chunk.toString();
  if (input.length > 8192) throw new Error("Input too large");
  if (input.includes("\n")) break;
}
if (process.stdin.isTTY) process.stdin.setRawMode(false);
const data = JSON.parse(input.trim());
if (
  !data.email ||
  typeof data.password !== "string" ||
  data.password.length < 10 ||
  data.password.length > 128
)
  throw new Error("Email and password of 10–128 characters required");
const email = data.email.trim().toLowerCase(),
  hash = await hashPassword(data.password);
let existing = "";
try {
  existing = await readFile(".dev.vars", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const lines = existing
  .split("\n")
  .filter((line) => !/^ZAKUPAI_ADMIN_(EMAIL|PASSWORD_HASH|NAME)=/.test(line));
lines.push(
  `ZAKUPAI_ADMIN_EMAIL=${JSON.stringify(email)}`,
  `ZAKUPAI_ADMIN_NAME=${JSON.stringify(data.name || "Ansar")}`,
  `ZAKUPAI_ADMIN_PASSWORD_HASH=${JSON.stringify(hash)}`,
);
await writeFile(".dev.vars", lines.filter(Boolean).join("\n") + "\n", {
  mode: 0o600,
});
process.stdout.write(
  "Administrator bootstrap saved in the untracked .dev.vars file.\n",
);
process.exit(0);
