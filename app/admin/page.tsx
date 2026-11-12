import { redirect } from "next/navigation";
import { requireUser, authRepository } from "@/lib/auth";
import { mailConfigured } from "@/lib/mail";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";
export default async function Admin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return (
    <AdminDashboard
      initial={await authRepository().overview(user.id)}
      userName={user.name}
      mailConfigured={mailConfigured()}
    />
  );
}
