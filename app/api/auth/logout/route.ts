import { cookies } from "next/headers";
import { api } from "@/lib/server";
import { authRepository, SESSION_COOKIE, sessionResponse } from "@/lib/auth";

export const POST = api(async (request) => {
  await authRepository().logout((await cookies()).get(SESSION_COOKIE)?.value);
  return sessionResponse(request, "", { ok: true });
});
