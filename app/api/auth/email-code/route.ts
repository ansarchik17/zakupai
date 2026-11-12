import { z } from "zod";
import { api, body } from "@/lib/server";
import { authRepository, clientKey } from "@/lib/auth";
import { mailConfigured, sendEmailCode } from "@/lib/mail";
import { AppError } from "@/lib/domain";

export const POST = api(async (request) => {
  const input = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(await body(request));
  if (!mailConfigured())
    throw new AppError(
      "Администратор ещё не подключил почту. Получить код и подтвердить приглашение пока нельзя.",
      503,
    );
  return authRepository().requestEmailCode(
    input.token,
    clientKey(request),
    async ({ email, name, code }) => sendEmailCode(email, name, code),
  );
});
