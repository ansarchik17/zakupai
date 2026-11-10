import { api, body, owner, repository } from "@/lib/server";
export const POST = api(async (request) =>
  repository().createOrder(await body(request), await owner()),
);
