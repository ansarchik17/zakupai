import { authRepository } from "@/lib/auth";
import { AppError } from "@/lib/domain";
import { AcceptInvitation } from "@/components/auth-forms";
import { Logo } from "@/components/primitives";

export const dynamic = "force-dynamic";
export default async function Invitation({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let link;
  try {
    link = await authRepository().link(token);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    return (
      <main className="invite-shell">
        <Logo />
        <section className="auth-card invite-card">
          <h1>Ссылка больше не действует</h1>
          <p className="muted">
            Возможно, приглашение уже принято, отозвано или прошло 24 часа.
            Попросите администратора создать новую ссылку.
          </p>
          <a className="button primary full" href="/login">
            Перейти ко входу
          </a>
        </section>
      </main>
    );
  }
  return (
    <AcceptInvitation
      token={token}
      email={link.email}
      name={link.name}
      workspace={link.workspace_name}
      reset={link.kind === "reset"}
    />
  );
}
