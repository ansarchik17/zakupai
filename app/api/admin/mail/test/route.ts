import { api } from "@/lib/server";
import { administrator, authRepository } from "@/lib/auth";
import { sendSmtpTest } from "@/lib/mail";

export const POST = api(async () => {
  const admin = await administrator();
  await authRepository().limit(`smtp-test:${admin.id}`, 3);
  return sendSmtpTest();
});
