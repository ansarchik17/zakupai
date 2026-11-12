import { api, body } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";
import { invitationInput } from "@/lib/auth-repository";
import { accessLinkUrl, mailConfigured, sendAccessLink } from "@/lib/mail";
import { AppError } from "@/lib/domain";

export const POST = api(async (request) => {
  const admin = await administrator(),
    input = invitationInput.parse(await body(request));
  if (!mailConfigured())
    throw new AppError(
      "Сначала подключите SMTP: организатор должен получить приглашение и код на свой email.",
      503,
    );
  const link = await authRepository().invite(admin.id, input),
    url = accessLinkUrl(request, link.token);
  let delivery: "sent" | "not_sent" | "failed" = "not_sent";
  {
    try {
      await sendAccessLink(link.email, link.name, url);
      delivery = "sent";
    } catch {
      delivery = "failed";
    }
    await authRepository().delivery(link.id, delivery);
  }
  return { url, expiresAt: link.expiresAt, delivery };
});
