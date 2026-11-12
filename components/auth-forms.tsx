"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Button, Field, Logo, request } from "./primitives";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <Button
        variant="ghost"
        busy={busy}
        aria-label="Выйти из аккаунта"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await request("/api/auth/logout", "POST");
            router.replace("/login");
            router.refresh();
          } catch {
            setError("Не удалось выйти. Попробуйте ещё раз.");
            setBusy(false);
          }
        }}
      >
        <LogOut size={17} />
        {!compact && "Выйти"}
      </Button>
      {error && (
        <small role="alert" className="error">
          {error}
        </small>
      )}
    </div>
  );
}

export function LoginForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">Рабочее пространство организатора</span>
          <h1>
            Каждая закупка
            <br />
            под контролем.
          </h1>
          <p>
            Заказы, оплаты и выдача — в одном месте. Войдите в свой кабинет,
            чтобы продолжить работу.
          </p>
          <div className="auth-benefit">
            <ShieldCheck size={21} />
            <span>У каждого организатора свой кабинет и свои покупатели.</span>
          </div>
        </div>
        <small>ZakupAI · Совместные закупки</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <span className="auth-lock">
            <LockKeyhole size={25} />
          </span>
          <h2>Войти в кабинет</h2>
          <p className="muted">
            Для администраторов и приглашённых организаторов.
          </p>
          <form
            className="modal-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const data = new FormData(event.currentTarget);
              setBusy(true);
              setError("");
              try {
                const result = await request<{ next: string }>(
                  "/api/auth/login",
                  "POST",
                  { email: data.get("email"), password: data.get("password") },
                );
                location.assign(result.next);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось войти");
                setBusy(false);
              }
            }}
          >
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Пароль">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button className="full" busy={busy}>
              Войти <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-note">
            <strong>Впервые в ZakupAI?</strong>
            <p>
              Для создания кабинета нужна ссылка-приглашение от администратора.
              Если забыли пароль, запросите у него ссылку для восстановления.
            </p>
          </div>
        </div>
        <p className="auth-customer-note">
          Покупателям входить не нужно: откройте ссылку на закупку от
          организатора.
        </p>
      </section>
    </main>
  );
}

export function AcceptInvitation({
  token,
  email,
  name,
  workspace,
  reset,
}: {
  token: string;
  email: string;
  name: string;
  workspace: string;
  reset: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="invite-shell">
      <Logo />
      <section className="auth-card invite-card">
        <span className="auth-lock">
          <Check size={26} />
        </span>
        <span className="eyebrow">
          {reset ? "Восстановление доступа" : "Личное приглашение"}
        </span>
        <h1>{reset ? "Новый пароль" : `Добро пожаловать, ${name}`}</h1>
        <p className="muted">
          {reset
            ? "Задайте новый пароль для своего аккаунта."
            : `Ваше рабочее пространство: ${workspace}.`}
        </p>
        <div className="invite-identity">
          <span>Email аккаунта</span>
          <strong>{email}</strong>
        </div>
        <form
          className="modal-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const data = new FormData(event.currentTarget);
            if (data.get("password") !== data.get("confirmation")) {
              setError("Пароли не совпадают");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const result = await request<{ next: string }>(
                "/api/auth/accept",
                "POST",
                { token, password: data.get("password") },
              );
              location.assign(result.next);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Не удалось принять приглашение",
              );
              setBusy(false);
            }
          }}
        >
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <Field
            label="Придумайте пароль"
            hint="Минимум 10 символов. Используйте уникальный пароль."
          >
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
          </Field>
          <Field label="Повторите пароль">
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button className="full" busy={busy}>
            {reset ? "Сохранить пароль и войти" : "Создать кабинет и войти"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-note">
          Ссылка одноразовая.{" "}
          {reset
            ? "После смены пароля прежние сеансы будут завершены."
            : "Вы получите отдельный кабинет для своих закупок."}
        </p>
      </section>
      <a className="text-link" href="/login">
        Перейти ко входу
      </a>
    </main>
  );
}
