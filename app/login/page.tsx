import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export default async function Login() {
  const user = await currentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/");
  return <LoginForm />;
}
