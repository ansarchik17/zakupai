import { api, owner, repository } from "@/lib/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () =>
    repository().orderLink(await owner(), (await params).id),
  )(request);
}
