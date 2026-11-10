import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AppError } from "./domain";
import { Repository } from "./repository";
import type { Database } from "./repository";

export function database() {
  if (!env.DB) throw new Error("DB binding missing");
  return env.DB as unknown as Database;
}
export function repository() {
  return new Repository(database());
}
export async function owner() {
  const user = await getChatGPTUser();
  if (!user) throw new AppError("Войдите в кабинет организатора", 401);
  return user.userId;
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 32000)
    throw new AppError("Слишком большой запрос", 413);
  const text = await request.text();
  if (text.length > 32000) throw new AppError("Слишком большой запрос", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Не удалось прочитать данные запроса");
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError("Запрос с другого сайта отклонён", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Запрос с другого сайта отклонён", 403);
}
export function api(handler: (request: Request) => Promise<unknown>) {
  return async (request: Request) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) sameOrigin(request);
      const result = await handler(request);
      return result instanceof Response
        ? result
        : Response.json(result ?? { ok: true }, {
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
    } catch (e) {
      if (e instanceof AppError)
        return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return Response.json(
          {
            error: e.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .slice(0, 3)
              .join(". "),
          },
          { status: 400 },
        );
      console.error(
        "ZakupAI request failed",
        e instanceof Error ? e.message : "Unknown error",
      );
      return Response.json(
        { error: "Не удалось выполнить действие. Попробуйте ещё раз." },
        { status: 500 },
      );
    }
  };
}
