export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  implicitTls: boolean;
};
export type MailMessage = { to: string; subject: string; text: string };
export type SmtpSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>;
  closed: Promise<unknown>;
  close(): Promise<void>;
  startTls(): SmtpSocket;
};
export type SmtpConnector = (
  address: { hostname: string; port: number },
  options: { secureTransport: "on" | "starttls" },
) => SmtpSocket;
const encoder = new TextEncoder();
const address =
  /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
const base64 = (text: string) =>
  btoa(String.fromCharCode(...encoder.encode(text)));

export function smtpConfig(
  settings: Record<string, string | undefined>,
): SmtpConfig {
  const host = settings.SMTP_HOST || "smtp.gmail.com",
    port = Number(settings.SMTP_PORT || "587");
  const username = settings.SMTP_USERNAME || settings.SMTP_USER || "",
    fromEmail = settings.SMTP_FROM_EMAIL || username;
  const implicitTls =
    settings.SMTP_IMPLICIT_TLS === "true" ||
    (settings.SMTP_IMPLICIT_TLS === undefined && port === 465);
  if (
    !/^[a-z0-9.-]+$/i.test(host) ||
    ![465, 587].includes(port) ||
    implicitTls !== (port === 465) ||
    settings.SMTP_USE_TLS === "false" ||
    settings.SMTP_SKIP_TLS_VERIFY === "true" ||
    !address.test(username) ||
    !address.test(fromEmail)
  )
    throw new Error("Invalid SMTP configuration: verified TLS is required");
  return {
    host,
    port,
    username,
    password: (settings.SMTP_PASSWORD || "").replace(/\s/g, ""),
    fromEmail,
    fromName: settings.SMTP_FROM_NAME || "ZakupAI",
    implicitTls,
  };
}

class Conversation {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";
  private decoder = new TextDecoder();
  constructor(socket: SmtpSocket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }
  async reply(expected: number) {
    let lines = 0,
      bytes = 0;
    while (true) {
      while (!this.buffer.includes("\r\n")) {
        const chunk = await this.reader.read();
        if (chunk.done) throw new Error("SMTP connection closed");
        this.buffer += this.decoder.decode(chunk.value, { stream: true });
        bytes += chunk.value.length;
        if (bytes > 32768) throw new Error("SMTP reply too large");
      }
      const end = this.buffer.indexOf("\r\n"),
        line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match || ++lines > 100 || Number(match[1]) !== expected)
        throw new Error(
          `SMTP rejected step (${match?.[1] || "invalid reply"})`,
        );
      if (match[2] === " ") return;
    }
  }
  async command(value: string, expected: number) {
    await this.writer.write(encoder.encode(value + "\r\n"));
    await this.reply(expected);
  }
  release() {
    if (this.buffer) throw new Error("Unexpected data before TLS upgrade");
    this.reader.releaseLock();
    this.writer.releaseLock();
  }
}

export async function smtpTransaction(
  connect: SmtpConnector,
  config: SmtpConfig,
  message?: MailMessage,
) {
  if (
    message &&
    (!address.test(message.to) ||
      /[\r\n]/.test(message.subject) ||
      message.subject.length > 200 ||
      encoder.encode(message.text).length > 20000)
  )
    throw new Error("Invalid email");
  if (message && !config.password) throw new Error("SMTP app password missing");
  let socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: config.implicitTls ? "on" : "starttls" },
  );
  socket.closed.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      await socket.opened;
      let conversation = new Conversation(socket);
      await conversation.reply(220);
      await conversation.command("EHLO zakupai.local", 250);
      if (!config.implicitTls) {
        await conversation.command("STARTTLS", 220);
        conversation.release();
        socket = socket.startTls();
        socket.closed.catch(() => {});
        await socket.opened;
        conversation = new Conversation(socket);
        await conversation.command("EHLO zakupai.local", 250);
      }
      if (config.password)
        await conversation.command(
          "AUTH PLAIN " +
            base64("\0" + config.username + "\0" + config.password),
          235,
        );
      if (message) {
        await conversation.command(`MAIL FROM:<${config.fromEmail}>`, 250);
        await conversation.command(`RCPT TO:<${message.to}>`, 250);
        await conversation.command("DATA", 354);
        const body =
          base64(message.text)
            .match(/.{1,76}/g)
            ?.join("\r\n") || "";
        const mime = [
          `From: =?UTF-8?B?${base64(config.fromName)}?= <${config.fromEmail}>`,
          `To: <${message.to}>`,
          `Subject: =?UTF-8?B?${base64(message.subject)}?=`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${crypto.randomUUID()}@zakupai.local>`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          "",
          body,
        ].join("\r\n");
        await conversation.command(mime + "\r\n.", 250);
      }
      await conversation.command("QUIT", 221);
      return { reachable: true, authenticated: Boolean(config.password) };
    };
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("SMTP connection timed out")),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await socket.close().catch(() => {});
  }
}
