import { api } from "@/lib/server";
import { administrator } from "@/lib/auth";
import { smtp } from "@/lib/smtp";
import { AppError } from "@/lib/domain";

export const POST = api(async () => {
  await administrator();
  try {
    return await smtp();
  } catch (error) {
    console.error(
      "SMTP check failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw new AppError(
      "Не удалось проверить SMTP. Проверьте соединение и пароль приложения Gmail.",
      503,
    );
  }
});
