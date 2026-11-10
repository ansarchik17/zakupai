import { api, body, owner, repository } from "@/lib/server";
import { z } from "zod";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (r) => {
    const d = z
      .object({ status: z.enum(["open", "closed", "completed"]) })
      .strict()
      .parse(await body(r));
    await repository().setCampaign(await owner(), (await params).id, d.status);
    return { ok: true };
  })(request);
}
