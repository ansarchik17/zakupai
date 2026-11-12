import { api } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";
import { mailConfigured } from "@/lib/mail";

export const GET = api(async () => ({
  ...(await authRepository().overview((await administrator()).id)),
  mailConfigured: mailConfigured(),
}));
