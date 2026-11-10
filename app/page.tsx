import { requireChatGPTUser } from "./chatgpt-auth";
import { repository } from "@/lib/server";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  return (
    <Dashboard
      initial={await repository().dashboard(user.userId)}
      userName={user.displayName}
      localPreview={import.meta.env.DEV && user.userId === "local_zakupai"}
    />
  );
}
