import { api, body } from "@/lib/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  authRepository,
  bootstrapAdmin,
  clientKey,
  sessionResponse,
} from "@/lib/auth";

export const POST = api(async (request) => {
  await bootstrapAdmin();
  const { user, token } = await authRepository().login(
    await body(request),
    clientKey(request),
  );
  if (user.role === "admin") {
    const legacy = await getChatGPTUser();
    if (legacy)
      await authRepository().adoptLegacyWorkspace(user.id, legacy.userId);
  }
  return sessionResponse(request, token, {
    next: user.role === "admin" ? "/admin" : "/",
  });
});
