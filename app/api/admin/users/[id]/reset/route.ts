import { api } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";
import { accessLinkUrl } from "@/lib/mail";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const admin = await administrator(),
      link = await authRepository().resetLink(admin.id, (await params).id);
    return {
      url: accessLinkUrl(request, link.token),
      expiresAt: link.expiresAt,
      delivery: "not_sent",
    };
  })(request);
}
