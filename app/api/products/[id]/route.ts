import { api, body, owner, repository } from "@/lib/server";
import { z } from "zod";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (r) => {
    const d = z
      .object({ active: z.boolean() })
      .strict()
      .parse(await body(r));
    await repository().toggleProduct(
      await owner(),
      (await params).id,
      d.active,
    );
    return { ok: true };
  })(request);
}
