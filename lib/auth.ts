import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthRepository, SESSION_SECONDS } from "./auth-repository";
import { database } from "./database";
import { AppError } from "./domain";

export const SESSION_COOKIE = "zakupai_session";
export const authRepository = () =>
  new AuthRepository(database(), env.EMAIL_CODE_SECRET);
export async function bootstrapAdmin() {
  await authRepository().bootstrap({
    email: env.ZAKUPAI_ADMIN_EMAIL,
    hash: env.ZAKUPAI_ADMIN_PASSWORD_HASH,
    name: env.ZAKUPAI_ADMIN_NAME,
  });
}
export async function currentUser() {
  return authRepository().session((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function administrator() {
  const user = await currentUser();
  if (!user) throw new AppError("Войдите в аккаунт", 401);
  return authRepository().requireAdmin(user.id);
}
export function clientKey(request: Request) {
  return request.headers.get("cf-connecting-ip") || "local";
}
export function sessionResponse(
  request: Request,
  token: string,
  data: unknown,
) {
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    },
  });
}
