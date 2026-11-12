import { env } from "cloudflare:workers";
import { AppError } from "./domain";

export function mailConfigured() {
  return Boolean(env.SMTP_RELAY_URL && env.SMTP_RELAY_TOKEN);
}
export function accessLinkUrl(request: Request, token: string) {
  const base = new URL(env.ZAKUPAI_PUBLIC_URL || request.url);
  if (!["http:", "https:"].includes(base.protocol))
    throw new Error("Invalid public URL");
  return new URL(`/invite/${token}`, base.origin).href;
}
export async function sendAccessLink(
  email: string,
  name: string,
  url: string,
  reset = false,
) {
  if (!mailConfigured())
    throw new AppError(
      "Почта пока не подключена. Передайте приглашение по ссылке.",
      503,
    );
  const relay = new URL(env.SMTP_RELAY_URL!);
  if (
    relay.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(relay.hostname)
  )
    throw new Error("Mail relay requires HTTPS");
  const response = await fetch(relay, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SMTP_RELAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: email,
      subject: reset ? "Смена пароля ZakupAI" : "Приглашение в ZakupAI",
      text: `${name}, здравствуйте!\n\n${reset ? "Администратор подготовил для вас ссылку для смены пароля." : "Вас пригласили стать организатором в ZakupAI."}\n\n${reset ? "Задайте новый пароль" : "Примите приглашение и задайте пароль"}:\n${url}\n\nСсылка действует 24 часа и может быть использована один раз. Не пересылайте её другим людям.\n\nЕсли вы не ожидали это письмо, проигнорируйте его.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new AppError(
      "Не удалось отправить письмо. Приглашение создано — передайте ссылку вручную.",
      502,
    );
}
