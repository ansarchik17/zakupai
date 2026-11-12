import { z } from "zod";
import { api, body } from "@/lib/server";
import { authRepository, clientKey, sessionResponse } from "@/lib/auth";

export const POST = api(async (request) => {
  const input = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string() })
    .strict()
    .parse(await body(request));
  const result = await authRepository().accept(
    input.token,
    { password: input.password },
    clientKey(request),
  );
  return sessionResponse(request, result.token, { next: result.next });
});
