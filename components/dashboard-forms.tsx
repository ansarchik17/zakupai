"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, Search } from "lucide-react";
import { Button, Modal, Field, Empty, Photo, dateText } from "./primitives";
import {
  money,
  nextStatuses,
  paymentLabels,
  paymentStatus,
  statusLabels,
} from "@/lib/domain";
import type { DashboardData, Order } from "@/lib/domain";

export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
export function localDateTime(value: number) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function PaymentBadge({ order }: { order: Order }) {
  const state = paymentStatus(order.paid, order.total);
  return (
    <span
      className={`badge ${order.status === "cancelled" ? "neutral" : state}`}
    >
      <span />
      {order.status === "cancelled" ? "Отменён" : paymentLabels[state]}
    </span>
  );
}
type FormProps = {
  data: DashboardData;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (d: unknown) => void;
};
export function ProductForm({
  data,
  busy,
  error,
  onClose,
  onSubmit,
}: FormProps) {
  return (
    <Modal title="Добавить товар" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            campaignId: f.get("campaignId"),
            name: f.get("name"),
            description: f.get("description"),
            price: Number(f.get("price")),
            sizes: String(f.get("sizes"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            colors: String(f.get("colors"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            image: f.get("image"),
          });
        }}
      >
        <Field label="Закупка">
          <select name="campaignId" required>
            {data.campaigns
              .filter((c) => c.status === "open")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Название товара">
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Например, Кроссовки Everyday"
          />
        </Field>
        <Field label="Описание">
          <textarea
            name="description"
            rows={2}
            maxLength={1500}
            placeholder="Что покупателю нужно знать о товаре"
          />
        </Field>
        <Field label="Цена за единицу, ₸">
          <input
            name="price"
            type="number"
            required
            min={1}
            max={10000000}
            step={1}
            placeholder="14500"
          />
        </Field>
        <div className="form-columns">
          <Field label="Размеры через запятую">
            <input name="sizes" required placeholder="36, 37, 38, 39" />
          </Field>
          <Field label="Цвета через запятую">
            <input name="colors" required placeholder="Белый, Чёрный" />
          </Field>
        </div>
        <Field
          label="Ссылка на фотографию"
          hint="Необязательно. Прямая ссылка https на изображение."
        >
          <input name="image" type="url" placeholder="https://…" />
        </Field>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        <Button className="full" busy={busy}>
          Добавить товар
        </Button>
      </form>
    </Modal>
  );
}
export function ManualOrder({
  data,
  busy,
  error,
  onClose,
  onSubmit,
}: FormProps) {
  const [campaign, setCampaign] = useState(
      data.campaigns.find((c) => c.status === "open")?.id || "",
    ),
    [productId, setProductId] = useState("");
  const products = data.products.filter(
      (p) => p.campaign_id === campaign && p.active,
    ),
    p = products.find((p) => p.id === productId) || products[0],
    attempt = useRef<{ payload: string; key: string } | null>(null);
  return (
    <Modal title="Добавить заказ за покупателя" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!p) return;
          const f = new FormData(e.currentTarget),
            d = {
              campaignId: campaign,
              customer: f.get("customer"),
              phone: f.get("phone"),
              comment: f.get("comment"),
              consent: true,
              items: [
                {
                  productId: p.id,
                  size: f.get("size"),
                  color: f.get("color"),
                  quantity: Number(f.get("quantity")),
                },
              ],
            },
            payload = JSON.stringify(d);
          if (attempt.current?.payload !== payload)
            attempt.current = { payload, key: crypto.randomUUID() };
          onSubmit({ ...d, idempotencyKey: attempt.current.key });
        }}
      >
        <Field label="Закупка">
          <select
            value={campaign}
            onChange={(e) => {
              setCampaign(e.target.value);
              setProductId("");
            }}
          >
            {data.campaigns
              .filter((c) => c.status === "open")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Товар">
          <select
            value={p?.id || ""}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {money(p.price)}
              </option>
            ))}
          </select>
        </Field>
        {p ? (
          <div className="form-columns" key={p.id}>
            <Field label="Размер">
              <select name="size">
                {p.sizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Цвет">
              <select name="color">
                {p.colors.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Количество">
              <input
                name="quantity"
                type="number"
                defaultValue={1}
                min={1}
                max={20}
                required
              />
            </Field>
          </div>
        ) : (
          <p className="muted">Сначала добавьте товар в закупку.</p>
        )}
        <Field label="Имя покупателя">
          <input name="customer" required minLength={2} maxLength={80} />
        </Field>
        <Field label="Телефон">
          <input
            name="phone"
            type="tel"
            required
            placeholder="+7 700 123 45 67"
          />
        </Field>
        <Field label="Комментарий">
          <textarea name="comment" rows={2} maxLength={500} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" required />
          Покупатель согласовал состав заказа и передачу контакта организатору
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="full" disabled={!p} busy={busy}>
          Сохранить заказ
        </Button>
      </form>
    </Modal>
  );
}
export function OrderDetails({
  order,
  campaignName,
  onClose,
  busy,
  error,
  onPay,
  onStatus,
}: {
  order: Order;
  campaignName: string;
  onClose: () => void;
  busy: boolean;
  error: string;
  onPay: (d: unknown) => Promise<boolean>;
  onStatus: (s: string) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState(order.total - order.paid),
    attempt = useRef<{ amount: number; key: string } | null>(null);
  useEffect(
    () => setAmount(order.total - order.paid),
    [order.paid, order.total],
  );
  return (
    <Modal title={`Заказ №${order.number}`} onClose={onClose}>
      <div className="order-details">
        <div className="details-customer">
          <span className="avatar">{initials(order.customer)}</span>
          <div>
            <h3>{order.customer}</h3>
            <a href={`tel:+${order.phone}`}>+{order.phone}</a>
          </div>
          <PaymentBadge order={order} />
        </div>
        <p className="muted small-text">
          {campaignName} · {dateText(order.created_at)} ·{" "}
          {order.source === "manual"
            ? "Добавлен организатором"
            : "Оформлен по ссылке"}
        </p>
        <div className="detail-items">
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
        </div>
        {order.comment ? (
          <p className="order-comment">{order.comment}</p>
        ) : null}
        <dl className="order-totals">
          <div>
            <dt>Сумма заказа</dt>
            <dd>{money(order.total)}</dd>
          </div>
          <div>
            <dt>Оплата подтверждена</dt>
            <dd className="green-text">{money(order.paid)}</dd>
          </div>
          <div>
            <dt>Осталось оплатить</dt>
            <dd>{money(order.total - order.paid)}</dd>
          </div>
        </dl>
        {order.payment_reported && order.paid < order.total ? (
          <div className="info-banner">
            Клиент сообщил об оплате. Проверьте поступление перед
            подтверждением.
          </div>
        ) : null}
        {order.paid < order.total && order.status !== "cancelled" ? (
          <form
            className="payment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (attempt.current?.amount !== amount)
                attempt.current = { amount, key: crypto.randomUUID() };
              await onPay({ amount, idempotencyKey: attempt.current.key });
            }}
          >
            <Field label="Подтвердить поступление, ₸">
              <input
                aria-label="Сумма поступившей оплаты"
                type="number"
                min={1}
                max={order.total - order.paid}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
            </Field>
            <Button busy={busy}>
              <Check size={17} />
              Подтвердить оплату
            </Button>
            <small>Отметка фиксирует сверку поступления организатором.</small>
          </form>
        ) : null}
        <div className="fulfillment">
          <span className="muted">Выполнение заказа</span>
          <strong>{statusLabels[order.status]}</strong>
          <div>
            {nextStatuses[order.status]
              ?.filter((s) => s !== "cancelled")
              .map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  busy={busy}
                  onClick={() => onStatus(s)}
                >
                  {
                    (
                      {
                        purchased: "Отметить выкуп",
                        received: "Товар получен",
                        ready: "Готов к выдаче",
                        delivered: "Подтвердить выдачу",
                      } as Record<string, string>
                    )[s]
                  }
                  <ArrowRight size={15} />
                </Button>
              ))}
            {nextStatuses[order.status]?.includes("cancelled") &&
            order.paid === 0 ? (
              <Button
                variant="danger"
                busy={busy}
                onClick={() => onStatus("cancelled")}
              >
                Отменить заказ
              </Button>
            ) : null}
          </div>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
export function Customers({
  orders,
  onSelect,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
}) {
  const [query, setQuery] = useState("");
  const grouped = new Map<
    string,
    { name: string; phone: string; orders: Order[] }
  >();
  for (const o of orders) {
    const c = grouped.get(o.phone) || {
      name: o.customer,
      phone: o.phone,
      orders: [],
    };
    c.orders.push(o);
    grouped.set(o.phone, c);
  }
  const customers = [...grouped.values()].filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-top">
        <h2>
          Покупатели <span className="count-label">{grouped.size}</span>
        </h2>
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя или телефон"
            aria-label="Найти покупателя"
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Покупатель</th>
              <th>Телефон</th>
              <th>Заказов</th>
              <th>Оплачено</th>
              <th>Последний заказ</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.phone}>
                <td>
                  <div className="customer-cell">
                    <span className="avatar">{initials(c.name)}</span>
                    <strong>{c.name}</strong>
                  </div>
                </td>
                <td>+{c.phone}</td>
                <td>{c.orders.length}</td>
                <td>{money(c.orders.reduce((s, o) => s + o.paid, 0))}</td>
                <td>
                  <button
                    className="text-link"
                    onClick={() => onSelect(c.orders[0])}
                  >
                    №{c.orders[0].number}
                    <ChevronRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!customers.length ? (
        <Empty title="Покупатели появятся после первых заказов" />
      ) : null}
    </section>
  );
}
