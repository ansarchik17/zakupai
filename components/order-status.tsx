"use client";
import { useState } from "react";
import { Check, CheckCheck, Copy, Package, RefreshCw } from "lucide-react";
import { Button, Logo, Photo, request } from "./primitives";
import { money, statusLabels } from "@/lib/domain";
import { PaymentBadge } from "./dashboard-forms";
import type { Order, Workspace } from "@/lib/domain";
type StatusData = {
  order: Order;
  workspace: Pick<Workspace, "name" | "pickup" | "kaspi_url" | "is_demo">;
};
export function OrderStatus({
  initial,
  token,
}: {
  initial: StatusData;
  token: string;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const action = async (report = false) => {
    setBusy(true);
    setError("");
    try {
      if (report) await request(`/api/order/${token}`, "POST");
      setData(await request<StatusData>(`/api/order/${token}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить заказ");
    } finally {
      setBusy(false);
    }
  };
  const { order, workspace } = data,
    steps = ["new", "purchased", "received", "ready", "delivered"],
    current = steps.indexOf(order.status);
  return (
    <main className="status-page">
      <Logo />
      {workspace.is_demo ? (
        <div className="demo-banner" style={{ marginTop: 20 }}>
          Демонстрационный заказ. Деньги не списываются.
        </div>
      ) : null}
      <section className="status-card">
        <span className="status-head-icon">
          <CheckCheck size={29} />
        </span>
        <h1>
          {order.status === "cancelled"
            ? "Заказ отменён"
            : "Ваш заказ сохранён"}
        </h1>
        <p>
          {workspace.name} · №{order.number}
        </p>
        <PaymentBadge order={order} />
        {order.status !== "cancelled" ? (
          <div className="status-timeline">
            {steps.map((s, i) => (
              <span key={s} className={i <= current ? "done" : ""}>
                {statusLabels[s]}
              </span>
            ))}
          </div>
        ) : null}
        {order.items.map((i) => (
          <div key={i.id} className="detail-item">
            <Photo src={i.image} alt={i.name} />
            <div>
              <strong>{i.name}</strong>
              <small>
                {i.size} / {i.color} / {i.quantity} шт.
              </small>
            </div>
            <strong>{money(i.unit_price * i.quantity)}</strong>
          </div>
        ))}
        <dl className="order-totals">
          <div>
            <dt>Сумма заказа</dt>
            <dd>{money(order.total)}</dd>
          </div>
          <div>
            <dt>Подтверждено</dt>
            <dd className="green-text">{money(order.paid)}</dd>
          </div>
          <div>
            <dt>Осталось оплатить</dt>
            <dd>{money(order.total - order.paid)}</dd>
          </div>
        </dl>
        {order.status !== "cancelled" && order.paid < order.total ? (
          <section className="status-section">
            <h2>Оплата заказа</h2>
            <p>
              {workspace.kaspi_url
                ? "Откройте Kaspi, укажите точную сумму и номер заказа в сообщении. После оплаты сообщите организатору кнопкой ниже."
                : "Организатор сообщит реквизиты для оплаты. Если уже оплатили, нажмите кнопку ниже."}
            </p>
            <div className="status-pay">
              {workspace.kaspi_url ? (
                <a
                  href={workspace.kaspi_url}
                  target="_blank"
                  rel="noreferrer"
                  className="button primary"
                >
                  Открыть Kaspi
                </a>
              ) : null}
              <Button
                variant="secondary"
                busy={busy}
                disabled={Boolean(order.payment_reported)}
                onClick={() => action(true)}
              >
                {order.payment_reported ? <Check size={16} /> : null}
                {order.payment_reported ? "Организатор уведомлён" : "Я оплатил"}
              </Button>
            </div>
            {order.payment_reported ? (
              <p style={{ marginTop: 13 }}>
                Поступление проверит организатор. Статус изменится после
                подтверждения.
              </p>
            ) : null}
          </section>
        ) : null}
        <section className="status-section">
          <h2>
            <Package
              size={17}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 7,
              }}
            />
            Получение
          </h2>
          <p>{workspace.pickup}</p>
        </section>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="status-pay">
          <Button variant="secondary" busy={busy} onClick={() => action()}>
            <RefreshCw size={15} />
            Обновить состояние
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href);
                setCopied(true);
              } catch {
                setError("Скопируйте адрес страницы из строки браузера.");
              }
            }}
          >
            <Copy size={15} />
            {copied ? "Ссылка скопирована" : "Сохранить ссылку"}
          </Button>
        </div>
      </section>
      <p className="status-save-note">
        Сохраните эту ссылку — по ней можно проверить заказ.
        <br />
        Не отправляйте её другим людям: она открывает сведения о вашей покупке.
      </p>
    </main>
  );
}
