import { api, body, owner, repository, database } from "@/lib/server";
import { workspaceInput } from "@/lib/domain";
import { seedDemo } from "@/lib/demo";
export const GET = api(async () => ({
  data: await repository().dashboard(await owner()),
}));
export const POST = api(async (request) => {
  const id = await owner(),
    d = workspaceInput.parse(await body(request));
  await repository().createWorkspace(id, d);
  if (d.demo) await seedDemo(database(), id);
  return { data: await repository().dashboard(id) };
});
export const PATCH = api(async (request) => {
  await repository().settings(await owner(), await body(request));
  return { ok: true };
});
