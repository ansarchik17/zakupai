import { requireUser } from "@/lib/auth";
import { repository } from "@/lib/server";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireUser();
  return (
    <Dashboard
      initial={await repository().dashboard(user.id)}
      userName={user.name}
      userRole={user.role}
    />
  );
}
