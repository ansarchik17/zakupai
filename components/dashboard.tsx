"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  ExternalLink,
  HelpCircle,
  Layers3,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Logo,
  Button,
  Modal,
  Field,
  Empty,
  Photo,
  request,
  dateText,
} from "./primitives";
import {
  Customers,
  ManualOrder,
  OrderDetails,
  ProductForm,
  PaymentBadge,
  initials,
  localDateTime,
} from "./dashboard-forms";
import { money, paymentStatus, procurement, statusLabels } from "@/lib/domain";
import type { DashboardData } from "@/lib/domain";

const views = [
  { id: "orders", label: "Заказы", icon: ClipboardList },
  { id: "campaigns", label: "Закупки", icon: Layers3 },
  { id: "products", label: "Товары", icon: ShoppingBag },
  { id: "procurement", label: "Список на выкуп", icon: Package },
  { id: "customers", label: "Покупатели", icon: Users },
];
const subtitles: Record<string, string> = {
  orders: "Вся закупка перед глазами. Ни один заказ не потеряется.",
  campaigns: "От открытия сбора до последней выдачи.",
  products: "То, что покупатели увидят по вашей ссылке.",
  procurement: "Товары, цвета и размеры — в одном списке поставщику.",
  customers: "Покупатели и история их заказов.",
  settings: "Условия вашей группы и способы получения.",
};
type FormKind = "campaign" | "product" | "order" | "help" | null;
export function Dashboard({
  initial,
  userName,
}: {
  initial: DashboardData | null;
  userName: string;
}) {
  const [data, setData] = useState(initial),
    [view, setView] = useState("orders"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [campaign, setCampaign] = useState(""),
    [modal, setModal] = useState<FormKind>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false),
    [workspaceName, setWorkspaceName] = useState("");
  useEffect(() => {
    const value = new URL(location.href).searchParams.get("view");
    if (value && [...views.map((v) => v.id), "settings"].includes(value))
      setView(value);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const refresh = async () => {
    const result = await request<{ data: DashboardData }>("/api/workspace");
    setData(result.data);
  };
  useEffect(() => {
    if (!data || busy) return;
    const update = () => {
      request<{ data: DashboardData }>("/api/workspace")
        .then((result) => setData(result.data))
        .catch(() => {});
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [Boolean(data), busy]);
  const run = async (
    action: () => Promise<unknown>,
    message = "Изменения сохранены",
  ) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const changeView = (value: string) => {
    setView(value);
    setQuery("");
    setFilter("all");
    setMenu(false);
    history.replaceState({}, "", `/?view=${value}`);
  };
  const closeModal = () => {
    if (!busy) {
      setModal(null);
      setError("");
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Скопировано. Можно отправить в WhatsApp.");
    } catch {
      setError(
        "Не удалось скопировать. Скопируйте адрес открытой страницы закупки.",
      );
    }
  };
  if (!data)
    return (
      <main className="welcome">
        <header>
          <Logo />
          <span className="muted">Кабинет организатора</span>
        </header>
        <div className="welcome-grid">
          <div>
            <span className="eyebrow">Меньше записей. Больше порядка.</span>
            <h1>
              Каждый заказ
              <br />
              на своём месте.
            </h1>
            <p className="lead">
              Собирайте закупку по ссылке, проверяйте оплаты и готовьте выкуп
              без переписывания в тетрадь.
            </p>
            <div className="welcome-benefits">
              <span>
                <Check size={18} /> Клиент выбирает размер и цвет
              </span>
              <span>
                <Check size={18} /> Заказ сразу появляется в кабинете
              </span>
              <span>
                <Check size={18} /> Список поставщику собирается сам
              </span>
            </div>
          </div>
          <section className="onboarding">
            <span className="onboarding-icon">
              <ShoppingBag size={32} />
            </span>
            <h2>Начнём с вашей закупки</h2>
            <p>
              Создайте пространство для своей группы или сначала посмотрите
              пример.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await run(
                  () =>
                    request("/api/workspace", "POST", {
                      name: workspaceName,
                      demo: false,
                    }),
                  "Пространство создано",
                );
              }}
            >
              <Field label="Название группы или магазина">
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Например, Доступный шоппинг"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
              <Button busy={busy} className="full">
                Создать пространство <ArrowRight size={17} />
              </Button>
            </form>
            <div className="or">
              <span />
              или
              <span />
            </div>
            <Button
              variant="secondary"
              className="full"
              busy={busy}
              onClick={() =>
                run(
                  () =>
                    request("/api/workspace", "POST", {
                      name: "Доступный шоппинг",
                      demo: true,
                    }),
                  "Демо открыто",
                )
              }
            >
              <Sparkles size={17} /> Посмотреть на примере
            </Button>
            <small>
              В демо используются вымышленные заказы и тестовые контакты.
            </small>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
          </section>
        </div>
        <footer>ZakupAI · Для организаторов совместных закупок</footer>
      </main>
    );
  const activeOrders = data.orders.filter((o) => o.status !== "cancelled"),
    scoped = campaign
      ? data.orders.filter((o) => o.campaign_id === campaign)
      : data.orders;
  const totals = {
    total: activeOrders.reduce((s, o) => s + o.total, 0),
    paid: activeOrders.reduce((s, o) => s + o.paid, 0),
    unpaid: activeOrders.filter((o) => o.paid < o.total).length,
  };
  const orders = scoped.filter(
    (o) =>
      (!query ||
        `${o.customer} ${o.phone} ${o.number} ${o.items.map((i) => i.name).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "ready" && o.status === "ready") ||
        (filter === paymentStatus(o.paid, o.total) &&
          o.status !== "cancelled")),
  );
  const selected = data.orders.find((o) => o.id === selectedId),
    rows = procurement(data.orders, campaign || undefined),
    openCampaign = data.campaigns.find(
      (c) => c.status === "open" && Date.parse(c.closes_at) > Date.now(),
    );
  const currentLabel =
    view === "settings" ? "Настройки" : views.find((v) => v.id === view)?.label;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <a href="/" className="brand-link">
          <Logo />
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {initials(data.workspace.name)}
          </span>
          <div>
            <strong>{data.workspace.name}</strong>
            <small>Организатор закупок</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Основная навигация">
          {views.map((v) => (
            <button
              key={v.id}
              className={`nav-item ${view === v.id ? "active" : ""}`}
              onClick={() => changeView(v.id)}
            >
              <v.icon size={19} />
              {v.label}
              {v.id === "orders" ? (
                <span className="nav-count">{data.orders.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-dot" />
            <strong>Группа остаётся в WhatsApp</strong>
            <p>
              Отправьте покупателям ссылку на закупку. Остальное соберётся
              здесь.
            </p>
            {openCampaign ? (
              <button
                onClick={() => copy(`${location.origin}/c/${openCampaign.id}`)}
              >
                Скопировать ссылку <Copy size={14} />
              </button>
            ) : null}
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => changeView("settings")}
          >
            <Settings2 size={19} />
            Настройки
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <HelpCircle size={19} />
            Как это работает
          </button>
          <div className="profile">
            <span className="avatar">{userName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{userName}</strong>
              <small>Мой кабинет</small>
            </div>
            <a
              href="/signout-with-chatgpt?return_to=%2F"
              target="_top"
              aria-label="Выйти"
            >
              <LogOut size={16} />
            </a>
          </div>
        </div>
      </aside>
      {menu ? (
        <button
          className="mobile-shade"
          aria-label="Закрыть меню"
          onClick={() => setMenu(false)}
        />
      ) : null}
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Рабочее пространство</span>
            <ChevronRight size={14} />
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" />
            Данные сохранены
            <span className="topbar-date">
              {dateText(new Date().toISOString())}
            </span>
          </div>
        </header>
        <main className="dashboard-main">
          {data.workspace.is_demo ? (
            <div className="demo-banner">
              <Sparkles size={15} />
              <span>
                Демо-пространство. Заказы и контакты вымышленные — используйте
                тестовые данные.
              </span>
            </div>
          ) : null}
          <div className="page-heading">
            <div>
              <h1>
                {currentLabel}
                <span className="title-dot">.</span>
              </h1>
              <p>{subtitles[view]}</p>
            </div>
            <div className="heading-actions">
              {openCampaign && view === "orders" ? (
                <a
                  className="button secondary"
                  href={`/c/${openCampaign.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowUpRight size={17} />
                  Страница закупки
                </a>
              ) : null}
              {view !== "settings" ? (
                <Button
                  onClick={() => {
                    setError("");
                    setModal(
                      view === "campaigns"
                        ? "campaign"
                        : view === "products"
                          ? "product"
                          : "order",
                    );
                  }}
                  disabled={view !== "campaigns" && !openCampaign}
                >
                  <Plus size={18} />
                  {view === "campaigns"
                    ? "Новая закупка"
                    : view === "products"
                      ? "Добавить товар"
                      : "Добавить заказ"}
                </Button>
              ) : null}
            </div>
          </div>
          {error && !modal && !selected ? (
            <div role="alert" className="error-banner">
              {error}
              <button
                className="icon-button"
                aria-label="Закрыть ошибку"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {view === "orders" ? (
            <>
              <section className="stats" aria-label="Сводка по заказам">
                <Stat
                  icon={<ClipboardList size={19} />}
                  label="Всего заказов"
                  value={String(activeOrders.length)}
                  detail="Без отменённых"
                />
                <Stat
                  icon={<Wallet size={19} />}
                  label="Сумма заказов"
                  value={money(totals.total)}
                  detail="По всем закупкам"
                />
                <Stat
                  icon={<CheckCheck size={19} />}
                  label="Подтверждено оплат"
                  value={money(totals.paid)}
                  detail={`${activeOrders.filter((o) => o.paid >= o.total).length} заказов оплачены полностью`}
                  green
                />
                <Stat
                  icon={<Clock3 size={19} />}
                  label="Ожидают оплату"
                  value={String(totals.unpaid)}
                  detail={money(totals.total - totals.paid) + " к получению"}
                />
              </section>
              <div className="orders-layout">
                <section className="panel order-panel">
                  <div className="panel-top">
                    <h2>
                      Последние заказы{" "}
                      <span className="count-label">{scoped.length}</span>
                    </h2>
                    <a
                      className="text-link"
                      href={`/api/export${campaign ? `?campaign=${campaign}` : ""}`}
                    >
                      <ArrowDownToLine size={15} />
                      Выгрузить
                    </a>
                  </div>
                  <div className="filter-tabs" aria-label="Фильтр оплаты">
                    {[
                      { id: "all", name: "Все заказы" },
                      { id: "unpaid", name: "Ожидают оплату" },
                      { id: "partial", name: "Частично" },
                      { id: "paid", name: "Оплачены" },
                      { id: "ready", name: "К выдаче" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={filter === f.id ? "selected" : ""}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                  <div className="table-toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Поиск заказов"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Имя, товар или номер заказа"
                      />
                    </label>
                    <label className="campaign-filter">
                      <SlidersHorizontal size={16} />
                      <select
                        aria-label="Фильтр по закупке"
                        value={campaign}
                        onChange={(e) => setCampaign(e.target.value)}
                      >
                        <option value="">Все закупки</option>
                        {data.campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {orders.length ? (
                    <div className="table-scroll">
                      <table className="orders-table">
                        <thead>
                          <tr>
                            <th>Покупатель</th>
                            <th>Заказ</th>
                            <th>Сумма</th>
                            <th>Оплата</th>
                            <th>Дата</th>
                            <th>
                              <span className="sr-only">Открыть</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o, i) => (
                            <tr
                              key={o.id}
                              onClick={() => {
                                setError("");
                                setSelectedId(o.id);
                              }}
                            >
                              <td>
                                <div className="customer-cell">
                                  <span className={`avatar tone-${i % 4}`}>
                                    {initials(o.customer)}
                                  </span>
                                  <div>
                                    <button
                                      className="row-link"
                                      onClick={() => setSelectedId(o.id)}
                                    >
                                      {o.customer}
                                    </button>
                                    <small>№{o.number}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="item-title">
                                  {o.items[0]?.name || "Заказ"}
                                </span>
                                <small>
                                  {o.items[0]?.size},{" "}
                                  {o.items[0]?.color.toLowerCase()} ·{" "}
                                  {o.items.reduce((s, i) => s + i.quantity, 0)}{" "}
                                  шт.
                                  {o.items.length > 1
                                    ? ` · ещё ${o.items.length - 1}`
                                    : ""}
                                </small>
                              </td>
                              <td>
                                <strong className="amount">
                                  {money(o.total)}
                                </strong>
                                {o.status !== "new" ? (
                                  <small>{statusLabels[o.status]}</small>
                                ) : null}
                              </td>
                              <td>
                                <PaymentBadge order={o} />
                                {o.payment_reported && o.paid < o.total ? (
                                  <small className="payment-reported">
                                    Клиент сообщил об оплате
                                  </small>
                                ) : null}
                              </td>
                              <td className="muted date-cell">
                                {dateText(o.created_at)}
                              </td>
                              <td>
                                <ChevronRight size={16} className="muted" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={
                        query || filter !== "all"
                          ? "Заказов по этому фильтру нет"
                          : "Здесь появится первый заказ"
                      }
                    >
                      <p>
                        Добавьте товар в закупку или измените выбранный фильтр.
                      </p>
                    </Empty>
                  )}
                  <div className="table-footer">
                    Показано {orders.length} из {scoped.length} заказов
                    <span>
                      <span className="live-dot" /> Сохранено в кабинете
                    </span>
                  </div>
                </section>
                <aside className="order-aside">
                  <section className="next-step">
                    <span className="section-icon">
                      <CheckCheck size={20} />
                    </span>
                    <h2>Что дальше?</h2>
                    <p>Несколько действий, чтобы закупка двигалась.</p>
                    <button onClick={() => setFilter("unpaid")}>
                      <span className="todo-icon amber">
                        <Clock3 size={16} />
                      </span>
                      <span>
                        Проверить оплаты
                        <strong>{totals.unpaid} заказов ждут</strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => setFilter("ready")}>
                      <span className="todo-icon green">
                        <Package size={16} />
                      </span>
                      <span>
                        Подготовить выдачу
                        <strong>
                          {
                            activeOrders.filter((o) => o.status === "ready")
                              .length
                          }{" "}
                          готовы к получению
                        </strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => changeView("procurement")}>
                      <span className="todo-icon blue">
                        <Layers3 size={16} />
                      </span>
                      <span>
                        Собрать выкуп
                        <strong>
                          {rows.reduce((s, r) => s + r.quantity, 0)} единиц в
                          заказах
                        </strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  <section className="mini-procurement">
                    <div className="panel-top">
                      <h2>На выкуп</h2>
                      <button
                        className="icon-button"
                        aria-label="Открыть список на выкуп"
                        onClick={() => changeView("procurement")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    {rows.slice(0, 4).map((r) => (
                      <div
                        className="mini-row"
                        key={`${r.productId}-${r.color}-${r.size}`}
                      >
                        <Photo src={r.image} alt={r.name} />
                        <div>
                          <strong>{r.name}</strong>
                          <small>
                            {r.color}, {r.size}
                          </small>
                        </div>
                        <span>
                          {r.quantity}
                          <small>шт.</small>
                        </span>
                      </div>
                    ))}
                    <button
                      className="text-link"
                      onClick={() => changeView("procurement")}
                    >
                      Открыть весь список <ArrowRight size={15} />
                    </button>
                  </section>
                  <div className="quiet-note">
                    <Check size={16} />
                    <p>
                      Каждый размер и цвет считаются отдельно. Заказы больше не
                      нужно переписывать.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          ) : null}
          {view === "campaigns" ? (
            <div className="campaign-grid">
              {data.campaigns.map((c) => {
                const orders = data.orders.filter(
                    (o) => o.campaign_id === c.id && o.status !== "cancelled",
                  ),
                  open =
                    c.status === "open" && Date.parse(c.closes_at) > Date.now();
                return (
                  <section className="panel campaign-card" key={c.id}>
                    <div className="campaign-card-top">
                      <span className="campaign-art">
                        <Layers3 size={27} />
                      </span>
                      <span className={`badge ${open ? "paid" : "neutral"}`}>
                        {open
                          ? "Идёт сбор"
                          : c.status === "completed"
                            ? "Завершена"
                            : "Сбор закрыт"}
                      </span>
                    </div>
                    <h2>{c.name}</h2>
                    <p>{c.supplier || "Поставщик не указан"}</p>
                    <div className="campaign-facts">
                      <span>
                        Завершение сбора<strong>{dateText(c.closes_at)}</strong>
                      </span>
                      <span>
                        Заказов<strong>{orders.length}</strong>
                      </span>
                      <span>
                        Сумма
                        <strong>
                          {money(orders.reduce((s, o) => s + o.total, 0))}
                        </strong>
                      </span>
                    </div>
                    <div className="campaign-actions">
                      <a
                        className="button secondary"
                        href={`/c/${c.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Страница <ExternalLink size={15} />
                      </a>
                      <button
                        className="icon-button"
                        aria-label={`Скопировать ссылку на ${c.name}`}
                        onClick={() => copy(`${location.origin}/c/${c.id}`)}
                      >
                        <Copy size={17} />
                      </button>
                      <Button
                        variant="ghost"
                        busy={busy}
                        disabled={c.status === "completed"}
                        onClick={() =>
                          run(
                            () =>
                              request(`/api/campaigns/${c.id}`, "PATCH", {
                                status: open
                                  ? "closed"
                                  : c.status === "closed"
                                    ? "completed"
                                    : "closed",
                              }),
                            open
                              ? "Сбор закрыт"
                              : "Состояние закупки обновлено",
                          )
                        }
                      >
                        {open
                          ? "Закрыть сбор"
                          : c.status === "completed"
                            ? "Завершена"
                            : "Завершить"}
                      </Button>
                    </div>
                  </section>
                );
              })}
              {!data.campaigns.length ? (
                <Empty title="Создайте первую закупку">
                  <p>Укажите название и срок сбора, затем добавьте товары.</p>
                </Empty>
              ) : null}
            </div>
          ) : null}
          {view === "products" ? (
            <>
              <div className="table-toolbar standalone">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Поиск товаров"
                    placeholder="Найти товар"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="product-grid">
                {data.products
                  .filter((p) =>
                    p.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <section
                      className={`catalog-card ${!p.active ? "inactive" : ""}`}
                      key={p.id}
                    >
                      <div className="catalog-image">
                        <Photo src={p.image} alt={p.name} />
                        <span
                          className={`badge ${p.active ? "paid" : "neutral"}`}
                        >
                          {p.active ? "Принимает заказы" : "Скрыт"}
                        </span>
                      </div>
                      <div className="catalog-info">
                        <small>
                          {
                            data.campaigns.find((c) => c.id === p.campaign_id)
                              ?.name
                          }
                        </small>
                        <h2>{p.name}</h2>
                        <strong className="product-price">
                          {money(p.price)}
                        </strong>
                        <p>{p.sizes.join(" / ")}</p>
                        <p className="muted">{p.colors.join(", ")}</p>
                        <div className="catalog-actions">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              copy(
                                `${p.name}\n${money(p.price)}\nРазмеры: ${p.sizes.join(", ")}\nЗаказать: ${location.origin}/c/${p.campaign_id}?product=${p.id}`,
                              )
                            }
                          >
                            <Copy size={15} />
                            Для WhatsApp
                          </Button>
                          <button
                            className="text-link"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  request(`/api/products/${p.id}`, "PATCH", {
                                    active: !p.active,
                                  }),
                                p.active ? "Товар скрыт" : "Товар доступен",
                              )
                            }
                          >
                            {p.active ? "Скрыть" : "Показать"}
                          </button>
                        </div>
                      </div>
                    </section>
                  ))}
              </div>
              {!data.products.length ? (
                <Empty title="Добавьте первый товар">
                  <p>Покупатель сможет выбрать его по ссылке на закупку.</p>
                </Empty>
              ) : null}
            </>
          ) : null}
          {view === "procurement" ? (
            <section className="panel">
              <div className="panel-top">
                <div>
                  <h2>Сводка по вариантам</h2>
                  <p className="muted small-text">
                    Отменённые заказы исключены. Частичная оплата не входит в
                    колонку «Оплачено».
                  </p>
                </div>
                <a
                  className="button secondary"
                  href={`/api/export?type=procurement${campaign ? `&campaign=${campaign}` : ""}`}
                >
                  <ArrowDownToLine size={16} />
                  Скачать CSV
                </a>
              </div>
              <div className="table-toolbar">
                <label className="campaign-filter">
                  <Layers3 size={16} />
                  <select
                    aria-label="Выбрать закупку для выкупа"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                  >
                    <option value="">Все закупки</option>
                    {data.campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="muted">
                  {rows.reduce((s, r) => s + r.quantity, 0)} единиц товара
                </span>
              </div>
              {rows.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Цвет</th>
                        <th>Размер</th>
                        <th>Заказано</th>
                        <th>Оплачено полностью</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={`${r.productId}-${r.color}-${r.size}`}>
                          <td>
                            <div className="product-cell">
                              <Photo src={r.image} alt={r.name} />
                              <strong>{r.name}</strong>
                            </div>
                          </td>
                          <td>{r.color}</td>
                          <td>
                            <span className="size-label">{r.size}</span>
                          </td>
                          <td>{r.quantity} шт.</td>
                          <td className="green-text">{r.paidQuantity} шт.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Пока нечего выкупать" />
              )}
            </section>
          ) : null}
          {view === "customers" ? (
            <Customers
              orders={data.orders}
              onSelect={(o) => setSelectedId(o.id)}
            />
          ) : null}
          {view === "settings" ? (
            <section className="panel settings-panel">
              <div className="panel-top">
                <h2>Ваше рабочее пространство</h2>
              </div>
              <form
                key={
                  data.workspace.name +
                  data.workspace.pickup +
                  data.workspace.kaspi_url
                }
                className="settings-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await run(() =>
                    request("/api/workspace", "PATCH", {
                      name: f.get("name"),
                      pickup: f.get("pickup"),
                      kaspiUrl: f.get("kaspiUrl"),
                    }),
                  );
                }}
              >
                <Field label="Название группы">
                  <input
                    name="name"
                    defaultValue={data.workspace.name}
                    required
                    maxLength={80}
                  />
                </Field>
                <Field label="Место и условия выдачи">
                  <textarea
                    name="pickup"
                    defaultValue={data.workspace.pickup}
                    required
                    maxLength={300}
                    rows={3}
                  />
                </Field>
                <Field
                  label="Ссылка на оплату Kaspi Pay"
                  hint="Необязательно. Ссылка вашей точки продаж. Поступление оплаты подтверждает организатор."
                >
                  <input
                    name="kaspiUrl"
                    type="url"
                    defaultValue={data.workspace.kaspi_url}
                    placeholder="https://kaspi.kz/pay/…"
                  />
                </Field>
                <Button busy={busy}>Сохранить настройки</Button>
              </form>
            </section>
          ) : null}
        </main>
        <footer className="app-footer">
          <span>zakupai.</span>Порядок в каждой закупке.
        </footer>
      </div>
      {notice ? (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      ) : null}
      {modal === "campaign" ? (
        <Modal title="Новая закупка" onClose={closeModal}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  () =>
                    request("/api/campaigns", "POST", {
                      name: f.get("name"),
                      supplier: f.get("supplier"),
                      closesAt: new Date(
                        String(f.get("closesAt")),
                      ).toISOString(),
                    }),
                  "Закупка создана",
                )
              )
                setModal(null);
            }}
          >
            <Field label="Название">
              <input
                name="name"
                placeholder="Например, Обувь на весну"
                required
                maxLength={80}
              />
            </Field>
            <Field label="Поставщик">
              <input
                name="supplier"
                placeholder="Необязательно"
                maxLength={100}
              />
            </Field>
            <Field label="Сбор заказов до">
              <input
                name="closesAt"
                type="datetime-local"
                required
                min={localDateTime(Date.now() + 60000)}
                defaultValue={localDateTime(Date.now() + 7 * 86400000)}
              />
            </Field>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <Button busy={busy} className="full">
              Открыть сбор заказов
            </Button>
          </form>
        </Modal>
      ) : null}
      {modal === "product" ? (
        <ProductForm
          data={data}
          busy={busy}
          error={error}
          onClose={closeModal}
          onSubmit={async (d) => {
            if (
              await run(
                () => request("/api/products", "POST", d),
                "Товар добавлен",
              )
            )
              setModal(null);
          }}
        />
      ) : null}
      {modal === "order" ? (
        <ManualOrder
          data={data}
          busy={busy}
          error={error}
          onClose={closeModal}
          onSubmit={async (d) => {
            if (
              await run(
                () => request("/api/orders", "POST", d),
                "Заказ добавлен",
              )
            )
              setModal(null);
          }}
        />
      ) : null}
      {modal === "help" ? (
        <Modal title="Как провести первую закупку" onClose={closeModal}>
          <div className="help-content">
            <ol>
              <li>
                <strong>Откройте закупку</strong>
                <p>Укажите название и дату окончания сбора.</p>
              </li>
              <li>
                <strong>Добавьте товары</strong>
                <p>Заполните цену, доступные размеры и цвета.</p>
              </li>
              <li>
                <strong>Отправьте ссылку в WhatsApp</strong>
                <p>Покупатели оформят заказы, и они появятся в кабинете.</p>
              </li>
              <li>
                <strong>Проверьте оплаты и подготовьте выкуп</strong>
                <p>
                  Подтверждайте поступления после сверки. Скачайте сводку по
                  вариантам.
                </p>
              </li>
            </ol>
          </div>
        </Modal>
      ) : null}
      {selected ? (
        <OrderDetails
          key={selected.id}
          order={selected}
          campaignName={
            data.campaigns.find((c) => c.id === selected.campaign_id)?.name ||
            ""
          }
          onClose={() => {
            if (!busy) {
              setSelectedId(null);
              setError("");
            }
          }}
          busy={busy}
          error={error}
          onPay={(d) =>
            run(
              () => request(`/api/orders/${selected.id}/payments`, "POST", d),
              "Оплата подтверждена",
            )
          }
          onStatus={(status) =>
            run(
              () =>
                request(`/api/orders/${selected.id}`, "PATCH", {
                  status,
                  expectedStatus: selected.status,
                }),
              "Состояние заказа обновлено",
            )
          }
        />
      ) : null}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  detail,
  green = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  green?: boolean;
}) {
  return (
    <div className={`stat ${green ? "stat-green" : ""}`}>
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>
        {green ? <span className="live-dot" /> : null}
        {detail}
      </small>
    </div>
  );
}
