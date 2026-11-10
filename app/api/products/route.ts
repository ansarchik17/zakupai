import { api, body, owner, repository } from "@/lib/server";
export const POST = api(async (request) => ({
  id: await repository().createProduct(await owner(), await body(request)),
}));
