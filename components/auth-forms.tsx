"use client";
import { useEffect, useState } from "react";
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
  mailReady,
}: {
  token: string;
  email: string;
  name: string;
  workspace: string;
  reset: boolean;
  mailReady: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [challenge, setChallenge] = useState<{
      challenge: string;
      expiresAt: string;
      resendAfterSeconds: number;
    } | null>(null),
    [code, setCode] = useState(""),
    [resendAt, setResendAt] = useState(0),
    [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const sendCode = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        challenge: string;
        expiresAt: string;
        resendAfterSeconds: number;
      }>("/api/auth/email-code", "POST", { token });
      const time = Date.now();
      setClock(time);
      setResendAt(time + result.resendAfterSeconds * 1000);
      setChallenge(result);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить код");
    } finally {
      setBusy(false);
    }
  };
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
        {mailReady ? (
          <div className="auth-note">
            <p>
              {challenge
                ? "Код отправлен на указанный email. Он действует 10 минут. Если письма нет, проверьте папку «Спам»."
                : "Подтвердите, что эта почта принадлежит вам. Код придёт только на email из приглашения."}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="full"
              style={{ marginTop: 14 }}
              busy={busy}
              disabled={resendSeconds > 0}
              onClick={sendCode}
            >
              {!challenge
                ? "Получить код на email"
                : resendSeconds > 0
                  ? `Отправить повторно через ${resendSeconds} с`
                  : "Отправить код повторно"}
            </Button>
          </div>
        ) : (
          <div className="info-banner" style={{ marginTop: 20 }}>
            Администратор ещё не подключил почту. Подтверждение приглашения
            станет доступно после настройки отправки писем.
          </div>
        )}
        {error && (
          <p className="error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </p>
        )}
        {challenge && (
          <form
            className="modal-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || !challenge) return;
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
                  {
                    token,
                    password: data.get("password"),
                    code,
                    challenge: challenge.challenge,
                  },
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
              label="Код из письма"
              hint="6 цифр. Не сообщайте этот код администратору или другим людям."
            >
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
              />
            </Field>
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
            <Button className="full" busy={busy} disabled={code.length !== 6}>
              {reset ? "Сохранить пароль и войти" : "Создать кабинет и войти"}
              <ArrowRight size={17} />
            </Button>
          </form>
        )}
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
