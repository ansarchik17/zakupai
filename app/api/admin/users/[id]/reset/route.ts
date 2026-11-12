import { api } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";
import { accessLinkUrl, mailConfigured, sendAccessLink } from "@/lib/mail";
import { AppError } from "@/lib/domain";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const admin = await administrator();
    if (!mailConfigured())
      throw new AppError(
        "Восстановление пароля доступно после подключения почты. Ссылка может быть отправлена только на email владельца аккаунта.",
        503,
      );
    return authRepository().sendPasswordReset(
      admin.id,
      (await params).id,
      async ({ email, name, token }) =>
        sendAccessLink(email, name, accessLinkUrl(request, token), true),
    );
  })(request);
}
