import test from "node:test";
import assert from "node:assert/strict";
import { smtpConfig, smtpTransaction } from "../lib/smtp-transport.ts";
import type { SmtpConnector, SmtpSocket } from "../lib/smtp-transport.ts";

const settings = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "587",
  SMTP_USERNAME: "sender@example.test",
  SMTP_PASSWORD: "test-app-password",
  SMTP_FROM_EMAIL: "sender@example.test",
  SMTP_FROM_NAME: "ZakupAI",
  SMTP_USE_TLS: "true",
  SMTP_IMPLICIT_TLS: "false",
  SMTP_SKIP_TLS_VERIFY: "false",
};
function server(rejectAuth = false) {
  const calls: { secure: boolean; command: string }[] = [];
  const encoder = new TextEncoder();
  let upgrades = 0;
  const socket = (secure: boolean, greeting: boolean): SmtpSocket => {
    let receiver: ReadableStreamDefaultController<Uint8Array>;
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        receiver = controller;
        if (greeting) receiver.enqueue(encoder.encode("220 ready\r\n"));
      },
    });
    let data = false,
      closed = false;
    return {
      readable,
      opened: Promise.resolve(),
      closed: Promise.resolve(),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          const command = new TextDecoder().decode(chunk).replace(/\r\n$/, "");
          calls.push({ secure, command });
          let reply: string;
          if (data) {
            data = false;
            reply = "250 accepted\r\n";
          } else if (command.startsWith("EHLO"))
            reply = secure
              ? "250-test\r\n250 AUTH PLAIN\r\n"
              : "250-test\r\n250 STARTTLS\r\n";
          else if (command === "STARTTLS") reply = "220 upgrade\r\n";
          else if (command.startsWith("AUTH")) {
            assert.equal(secure, true, "Пароль нельзя отправлять до TLS");
            reply = rejectAuth
              ? "535 invalid credentials\r\n"
              : "235 authenticated\r\n";
          } else if (command.startsWith("MAIL") || command.startsWith("RCPT"))
            reply = "250 ok\r\n";
          else if (command === "DATA") {
            data = true;
            reply = "354 continue\r\n";
          } else if (command === "QUIT") reply = "221 bye\r\n";
          else throw new Error("Unexpected SMTP command");
          receiver.enqueue(encoder.encode(reply));
        },
      }),
      close: async () => {
        if (!closed) {
          closed = true;
          receiver.close();
        }
      },
      startTls() {
        assert.equal(secure, false);
        upgrades++;
        return socket(true, false);
      },
    };
  };
  const connect: SmtpConnector = (_, options) =>
    socket(options.secureTransport === "on", true);
  return { connect, calls, upgrades: () => upgrades };
}

test("SMTP 587 сначала устанавливает STARTTLS, затем аутентифицируется и отправляет UTF-8 письмо", async () => {
  const fake = server();
  const result = await smtpTransaction(fake.connect, smtpConfig(settings), {
    to: "owner@example.test",
    subject: "Код подтверждения",
    text: "Ваш код: 123456",
  });
  assert.deepEqual(result, { reachable: true, authenticated: true });
  assert.equal(fake.upgrades(), 1);
  assert.ok(fake.calls.find((x) => x.command === "STARTTLS"));
  assert.ok(
    fake.calls
      .filter((x) => x.command.startsWith("AUTH"))
      .every((x) => x.secure),
  );
  const mime = fake.calls.find((x) => x.command.startsWith("From:"))!.command;
  assert.ok(mime.includes("To: <owner@example.test>"));
  assert.ok(mime.includes(Buffer.from("Ваш код: 123456").toString("base64")));
});
test("SMTP 465 использует TLS сразу; проверка соединения без пароля не отправляет письма", async () => {
  const fake = server();
  const config = smtpConfig({
    ...settings,
    SMTP_PORT: "465",
    SMTP_IMPLICIT_TLS: "true",
    SMTP_PASSWORD: "",
  });
  assert.deepEqual(await smtpTransaction(fake.connect, config), {
    reachable: true,
    authenticated: false,
  });
  assert.equal(fake.upgrades(), 0);
  assert.equal(
    fake.calls.some(
      (x) => x.command.startsWith("AUTH") || x.command === "DATA",
    ),
    false,
  );
});
test("проверка сертификата обязательна; заголовки и адреса не допускают инъекций", async () => {
  assert.throws(() =>
    smtpConfig({ ...settings, SMTP_SKIP_TLS_VERIFY: "true" }),
  );
  assert.throws(() => smtpConfig({ ...settings, SMTP_USE_TLS: "false" }));
  assert.throws(() => smtpConfig({ ...settings, SMTP_PORT: "25" }));
  const fake = server();
  await assert.rejects(() =>
    smtpTransaction(fake.connect, smtpConfig(settings), {
      to: "owner@example.test\r\nBcc: other@example.test",
      subject: "Test",
      text: "Test",
    }),
  );
  await assert.rejects(() =>
    smtpTransaction(fake.connect, smtpConfig(settings), {
      to: "owner@example.test",
      subject: "Test\r\nBcc: other",
      text: "Test",
    }),
  );
  assert.equal(fake.calls.length, 0);
});
test("ошибка SMTP-аутентификации не раскрывает пароль", async () => {
  const fake = server(true);
  await assert.rejects(
    () => smtpTransaction(fake.connect, smtpConfig(settings)),
    (e: unknown) =>
      e instanceof Error &&
      e.message.includes("535") &&
      !e.message.includes(settings.SMTP_PASSWORD),
  );
});
