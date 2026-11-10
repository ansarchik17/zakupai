import { api, body, owner, repository } from "@/lib/server";
export const POST = api(async (request) => ({
  id: await repository().createCampaign(await owner(), await body(request)),
}));
