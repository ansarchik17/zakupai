import { env } from "cloudflare:workers";
import { AppError } from "./domain";
import { directSmtpConfigured, smtp } from "./smtp";
import type { MailMessage } from "./smtp-transport";

export function mailConfigured() {
  return (
    directSmtpConfigured() ||
    Boolean(env.SMTP_RELAY_URL && env.SMTP_RELAY_TOKEN)
  );
}

async function deliverMail(message: MailMessage) {
  if (!mailConfigured())
    throw new AppError(
      "Почта пока не подключена. Подтверждение email недоступно.",
      503,
    );
  try {
    if (directSmtpConfigured()) {
      await smtp(message);
      return;
    }
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
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("SMTP relay rejected delivery");
  } catch (error) {
    console.error(
      "SMTP delivery failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw new AppError(
      "Не удалось отправить письмо. Проверьте настройки SMTP и повторите попытку.",
      503,
    );
  }
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
  await deliverMail({
    to: email,
    subject: reset ? "Смена пароля ZakupAI" : "Приглашение в ZakupAI",
    text: `${name}, здравствуйте!\n\n${reset ? "Администратор подготовил для вас ссылку для смены пароля." : "Вас пригласили стать организатором в ZakupAI."}\n\nОткройте ссылку, запросите код на этот email и задайте пароль:\n${url}\n\nСсылка действует 24 часа. Без кода из отдельного письма войти в аккаунт нельзя.\n\nЕсли вы не ожидали это письмо, проигнорируйте его.`,
  });
}

export async function sendEmailCode(email: string, name: string, code: string) {
  await deliverMail({
    to: email,
    subject: "Код подтверждения ZakupAI",
    text: `${name}, ваш код для подтверждения email в ZakupAI:\n\n${code}\n\nКод действует 10 минут и подходит только для этого приглашения или восстановления пароля. Не сообщайте код другим людям, в том числе администратору.\n\nЕсли вы не запрашивали код, проигнорируйте это письмо.`,
  });
}

export async function sendSmtpTest() {
  if (!env.SMTP_FROM_EMAIL)
    throw new AppError("Не настроен адрес отправителя", 503);
  await deliverMail({
    to: env.SMTP_FROM_EMAIL,
    subject: "ZakupAI: проверка SMTP",
    text: "Это тестовое письмо ZakupAI.\n\nSMTP-соединение, защищённая авторизация и отправка писем работают. Теперь приглашения и коды подтверждения отправляются с этого адреса.\n\nНикаких действий с аккаунтами организаторов это письмо не выполняет.",
  });
  return { sent: true, to: env.SMTP_FROM_EMAIL };
}
