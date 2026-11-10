import { api, repository } from "@/lib/server";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return api(async () => repository().publicOrder((await params).token))(
    request,
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return api(async () => {
    await repository().reportPayment((await params).token);
    return { ok: true };
  })(request);
}
