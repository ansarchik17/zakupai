import { api, body } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";
import { invitationInput } from "@/lib/auth-repository";
import { accessLinkUrl, sendAccessLink } from "@/lib/mail";

export const POST = api(async (request) => {
  const admin = await administrator(),
    input = invitationInput.parse(await body(request));
  const link = await authRepository().invite(admin.id, input),
    url = accessLinkUrl(request, link.token);
  let delivery: "sent" | "not_sent" | "failed" = "not_sent";
  if (input.sendEmail) {
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
