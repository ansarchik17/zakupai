import { api } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    await authRepository().revoke(
      (await administrator()).id,
      (await params).id,
    );
    return { ok: true };
  })(request);
}
