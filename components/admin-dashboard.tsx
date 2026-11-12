"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { AdminOverview } from "@/lib/auth-repository";
import {
  Button,
  Empty,
  Field,
  Logo,
  Modal,
  dateText,
  request,
} from "./primitives";
import { LogoutButton } from "./auth-forms";

type LinkResult = { url: string; expiresAt: string; delivery: string };
export function AdminDashboard({
  initial,
  userName,
  mailConfigured,
}: {
  initial: AdminOverview;
  userName: string;
  mailConfigured: boolean;
}) {
  const [data, setData] = useState(initial),
    [view, setView] = useState("organizers"),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState<LinkResult | null>(null),
    [copied, setCopied] = useState(false),
    [clock] = useState(() => Date.now());
  const organizers = data.users.filter((u) => u.role === "organizer"),
    pending = data.invitations.filter(
      (i) =>
        !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > clock,
    );
  const refresh = async () =>
    setData(await request<AdminOverview>("/api/admin"));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  };
  const showLink = (result: LinkResult) => {
    setLink(result);
    setCopied(false);
  };
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo />
        <div className="admin-role">
          <ShieldCheck size={17} />
          Администратор
        </div>
        <nav aria-label="Администрирование">
          <button
            className={`nav-item ${view === "organizers" ? "active" : ""}`}
            onClick={() => setView("organizers")}
          >
            <Users size={19} />
            Организаторы<span className="nav-count">{organizers.length}</span>
          </button>
          <button
            className={`nav-item ${view === "invitations" ? "active" : ""}`}
            onClick={() => setView("invitations")}
          >
            <Mail size={19} />
            Приглашения<span className="nav-count">{pending.length}</span>
          </button>
        </nav>
        <div className="admin-sidebar-bottom">
          <Link className="nav-item" href="/">
            <ArrowRight size={18} />
            Мои закупки
          </Link>
          <div className="admin-profile">
            <strong>{userName}</strong>
            <small>Управление ZakupAI</small>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <span>Управление сервисом</span>
          <span>
            <ShieldCheck size={15} /> Только для администратора
          </span>
        </header>
        <div className="admin-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">ZakupAI / Администрирование</span>
              <h1>
                {view === "organizers" ? "Организаторы" : "Приглашения"}
                <span className="title-dot">.</span>
              </h1>
              <p>
                Приглашайте организаторов и управляйте доступом к их кабинетам.
              </p>
            </div>
            <Button
              onClick={() => {
                setModal(true);
                setError("");
              }}
            >
              <Plus size={18} />
              Пригласить организатора
            </Button>
          </div>
          <section className="stats admin-stats" aria-label="Сводка">
            <div className="stat">
              <div className="stat-label">
                Всего организаторов
                <Users size={19} />
              </div>
              <strong>{organizers.length}</strong>
              <small>Отдельные рабочие пространства</small>
            </div>
            <div className="stat">
              <div className="stat-label">
                Активные кабинеты
                <ShieldCheck size={19} />
              </div>
              <strong>
                {organizers.filter((u) => u.status === "active").length}
              </strong>
              <small>Доступ к заказам открыт</small>
            </div>
            <div className="stat">
              <div className="stat-label">
                Ожидают приглашения
                <Mail size={19} />
              </div>
              <strong>{pending.length}</strong>
              <small>Ссылки действуют 24 часа</small>
            </div>
          </section>
          {!mailConfigured && (
            <div className="info-banner admin-mail-note">
              <Mail size={19} />
              <div>
                <strong>Почта пока не подключена</strong>
                <p>
                  Создавайте приглашения и передавайте персональные ссылки
                  организаторам. После подключения почты их можно будет
                  отправлять письмом.
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Закрыть ошибку"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <section className="panel">
            <div className="panel-top">
              <h2>
                {view === "organizers"
                  ? "Кабинеты организаторов"
                  : "История приглашений"}
              </h2>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Поиск по имени или email"
                  placeholder="Имя или email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            {view === "organizers" ? (
              organizers.length ? (
                <div className="table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Организатор</th>
                        <th>Рабочее пространство</th>
                        <th>Закупки / заказы</th>
                        <th>Доступ</th>
                        <th>Последний вход</th>
                        <th>Управление</th>
                      </tr>
                    </thead>
                    <tbody>
                      {organizers
                        .filter((u) =>
                          `${u.name} ${u.email}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((u) => (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.name}</strong>
                              <small>{u.email}</small>
                            </td>
                            <td>{u.workspace_name || "Ещё не создано"}</td>
                            <td>
                              {u.campaigns} / {u.orders}
                            </td>
                            <td>
                              <span
                                className={`badge ${u.status === "active" ? "paid" : "neutral"}`}
                              >
                                {u.status === "active" ? "Активен" : "Отключён"}
                              </span>
                            </td>
                            <td>
                              {u.last_login_at
                                ? dateText(u.last_login_at)
                                : "Ещё не входил"}
                            </td>
                            <td>
                              <div className="admin-row-actions">
                                <Button
                                  variant="ghost"
                                  busy={busy}
                                  onClick={() =>
                                    run(() =>
                                      request(
                                        `/api/admin/users/${u.id}`,
                                        "PATCH",
                                        { active: u.status !== "active" },
                                      ),
                                    )
                                  }
                                >
                                  {u.status === "active"
                                    ? "Отключить"
                                    : "Включить"}
                                </Button>
                                <button
                                  className="icon-button"
                                  aria-label={`Восстановить пароль ${u.name}`}
                                  disabled={busy || u.status !== "active"}
                                  onClick={() =>
                                    run(async () =>
                                      showLink(
                                        await request<LinkResult>(
                                          `/api/admin/users/${u.id}/reset`,
                                          "POST",
                                        ),
                                      ),
                                    )
                                  }
                                >
                                  <KeyRound size={17} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Пригласите первого организатора">
                  <p>
                    Он задаст свой пароль и получит отдельное пространство для
                    закупок.
                  </p>
                  <Button onClick={() => setModal(true)}>
                    <Plus size={17} />
                    Создать приглашение
                  </Button>
                </Empty>
              )
            ) : data.invitations.length ? (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Кому</th>
                      <th>Группа</th>
                      <th>Состояние</th>
                      <th>Письмо</th>
                      <th>Срок ссылки</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.invitations
                      .filter((i) =>
                        `${i.name} ${i.email}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((i) => {
                        const active =
                          !i.accepted_at &&
                          !i.revoked_at &&
                          Date.parse(i.expires_at) > clock;
                        return (
                          <tr key={i.id}>
                            <td>
                              <strong>{i.name}</strong>
                              <small>{i.email}</small>
                            </td>
                            <td>{i.workspace_name}</td>
                            <td>
                              <span
                                className={`badge ${i.accepted_at ? "paid" : active ? "partial" : "neutral"}`}
                              >
                                {i.accepted_at
                                  ? "Принято"
                                  : i.revoked_at
                                    ? "Отозвано"
                                    : active
                                      ? "Ожидает"
                                      : "Истекло"}
                              </span>
                            </td>
                            <td>
                              {i.delivery_status === "sent"
                                ? "Отправлено"
                                : i.delivery_status === "failed"
                                  ? "Ошибка отправки"
                                  : "Не отправлялось"}
                            </td>
                            <td>
                              {new Date(i.expires_at).toLocaleString("ru-KZ", {
                                timeZone: "Asia/Almaty",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td>
                              {active && (
                                <Button
                                  variant="ghost"
                                  busy={busy}
                                  onClick={() =>
                                    run(() =>
                                      request(
                                        `/api/admin/invitations/${i.id}`,
                                        "DELETE",
                                      ),
                                    )
                                  }
                                >
                                  Отозвать
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Приглашений пока нет">
                <p>
                  Начните с организатора, с которым планируете первую закупку.
                </p>
              </Empty>
            )}
          </section>
          <p className="admin-footnote">
            <ShieldCheck size={15} /> Организаторы видят только свои закупки.
            Покупателям регистрация не нужна.
          </p>
        </div>
      </main>
      {modal && (
        <Modal
          title="Пригласить организатора"
          onClose={() => {
            if (!busy) setModal(false);
          }}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const form = new FormData(e.currentTarget);
              await run(async () => {
                const result = await request<LinkResult>(
                  "/api/admin/invitations",
                  "POST",
                  {
                    name: form.get("name"),
                    email: form.get("email"),
                    workspaceName: form.get("workspaceName"),
                    sendEmail: form.get("sendEmail") === "on",
                  },
                );
                setModal(false);
                setView("invitations");
                showLink(result);
              });
            }}
          >
            <p className="muted">
              Организатор получит собственный кабинет и самостоятельно задаст
              пароль.
            </p>
            <Field label="Имя организатора">
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </Field>
            <Field label="Название группы или магазина">
              <input
                name="workspaceName"
                required
                minLength={2}
                maxLength={80}
                placeholder="Например, Доступный шоппинг"
              />
            </Field>
            <label className="checkbox">
              <input
                name="sendEmail"
                type="checkbox"
                defaultChecked={mailConfigured}
                disabled={!mailConfigured}
              />
              Отправить приглашение на email
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button className="full" busy={busy}>
              Создать приглашение
              <ArrowRight size={17} />
            </Button>
          </form>
        </Modal>
      )}
      {link && (
        <Modal title="Ссылка готова" onClose={() => setLink(null)}>
          <div className="modal-form">
            <div
              className={
                link.delivery === "failed" ? "error-banner" : "info-banner"
              }
            >
              {link.delivery === "sent"
                ? "Письмо отправлено. Ссылку также можно скопировать."
                : link.delivery === "failed"
                  ? "Письмо не отправилось. Передайте эту ссылку организатору вручную."
                  : "Передайте эту персональную ссылку владельцу аккаунта."}
            </div>
            <Field label="Одноразовая ссылка">
              <textarea
                value={link.url}
                readOnly
                rows={3}
                onFocus={(e) => e.target.select()}
              />
            </Field>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                } catch {
                  setError("Выделите и скопируйте ссылку вручную.");
                }
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? "Скопировано" : "Скопировать ссылку"}
            </Button>
            <p className="muted small-text">
              Ссылка действует 24 часа и показывается только сейчас. Новое
              приглашение на тот же email отменит предыдущее.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
