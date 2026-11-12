import { z } from "zod";
import { api, body } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const admin = await administrator(),
      input = z
        .object({ active: z.boolean() })
        .strict()
        .parse(await body(request));
    await authRepository().setAccess(admin.id, (await params).id, input.active);
    return { ok: true };
  })(request);
}
