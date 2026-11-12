import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM,
  SMTP_RELAY_TOKEN,
  SMTP_RELAY_PORT = "3025",
  SMTP_RELAY_HOST = "127.0.0.1",
} = process.env;
if (
  !SMTP_HOST ||
  !SMTP_USER ||
  !SMTP_PASSWORD ||
  !SMTP_FROM ||
  !SMTP_RELAY_TOKEN ||
  SMTP_RELAY_TOKEN.length < 32
)
  throw new Error(
    "Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM and SMTP_RELAY_TOKEN (32+ characters) in .env.smtp",
  );
const port = Number(SMTP_PORT);
if (![465, 587].includes(port))
  throw new Error(
    "Use authenticated TLS SMTP on port 465 or STARTTLS on port 587",
  );
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  requireTLS: port === 587,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  connectionTimeout: 10000,
  socketTimeout: 15000,
});
function authorized(value) {
  const actual = Buffer.from(value || ""),
    expected = Buffer.from(`Bearer ${SMTP_RELAY_TOKEN}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const server = http.createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  const reply = (code, body) => {
    response.writeHead(code);
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST" || request.url !== "/send") {
    reply(404, { error: "Not found" });
    return;
  }
  if (!authorized(request.headers.authorization)) {
    reply(401, { error: "Unauthorized" });
    return;
  }
  try {
    let content = "";
    for await (const chunk of request) {
      content += chunk;
      if (content.length > 16000) {
        reply(413, { error: "Request too large" });
        return;
      }
    }
    const { to, subject, text } = JSON.parse(content);
    if (
      typeof to !== "string" ||
      !/^[^\s@,<>\r\n]+@[^\s@,<>\r\n]+\.[^\s@,<>\r\n]+$/.test(to) ||
      typeof subject !== "string" ||
      subject.length > 200 ||
      /[\r\n]/.test(subject) ||
      typeof text !== "string" ||
      text.length > 12000
    ) {
      reply(400, { error: "Invalid email" });
      return;
    }
    const result = await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
    });
    if (!result.accepted?.length) throw new Error("Recipient rejected");
    reply(200, { ok: true });
  } catch {
    reply(502, { error: "Email could not be sent" });
  }
});
server.requestTimeout = 20000;
server.listen(Number(SMTP_RELAY_PORT), SMTP_RELAY_HOST, () =>
  console.log(`SMTP relay listening on ${SMTP_RELAY_HOST}:${SMTP_RELAY_PORT}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      transport.close();
      process.exit(0);
    }),
  );
