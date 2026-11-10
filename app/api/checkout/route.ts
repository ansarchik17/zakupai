import { api, body, repository } from "@/lib/server";
export const POST = api(async (request) =>
  repository().createOrder(await body(request)),
);
