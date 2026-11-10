import { api, body, owner, repository } from "@/lib/server";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (r) => {
    await repository().setOrderStatus(
      await owner(),
      (await params).id,
      await body(r),
    );
    return { ok: true };
  })(request);
}
