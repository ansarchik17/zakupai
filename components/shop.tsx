"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Package,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import {
  Button,
  Empty,
  Field,
  Logo,
  Modal,
  Photo,
  dateText,
  request,
} from "./primitives";
import { money } from "@/lib/domain";
import type { Campaign, Product, Workspace } from "@/lib/domain";

type CartItem = {
  product: Product;
  size: string;
  color: string;
  quantity: number;
};
export function Shop({
  campaign,
  workspace,
  products,
}: {
  campaign: Campaign;
  workspace: Pick<Workspace, "name" | "pickup" | "kaspi_url" | "is_demo">;
  products: Product[];
}) {
  const [cart, setCart] = useState<CartItem[]>([]),
    [selected, setSelected] = useState<Product | null>(null),
    [checkout, setCheckout] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null),
    open =
      campaign.status === "open" && Date.parse(campaign.closes_at) > Date.now();
  useEffect(() => {
    const id = new URL(location.href).searchParams.get("product");
    if (id) setSelected(products.find((p) => p.id === id) || null);
  }, [products]);
  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
    count = cart.reduce((s, i) => s + i.quantity, 0);
  const add = (item: CartItem) => {
    const existing = cart.find(
      (i) =>
        i.product.id === item.product.id &&
        i.size === item.size &&
        i.color === item.color,
    );
    if (existing && existing.quantity + item.quantity > 20) {
      setError("В одном заказе можно выбрать до 20 единиц каждого варианта.");
      return;
    }
    setCart((prev) =>
      existing
        ? prev.map((i) =>
            i === existing ? { ...i, quantity: i.quantity + item.quantity } : i,
          )
        : [...prev, item],
    );
    setError("");
    setSelected(null);
  };
  return (
    <main className="shop-shell">
      <header className="shop-header">
        <Logo />
        <span>{workspace.name}</span>
      </header>
      {workspace.is_demo ? (
        <div className="demo-banner" style={{ marginTop: 20 }}>
          <ShoppingBag size={15} />
          Демонстрационная закупка. Используйте тестовые данные.
        </div>
      ) : null}
      <div className="shop-intro">
        <div>
          <h1>
            {campaign.name}
            <span className="title-dot">.</span>
          </h1>
          <p>Выберите товар, размер и цвет. Организатор получит ваш заказ.</p>
        </div>
        <span className="shop-deadline">
          <Clock3
            size={14}
            style={{
              display: "inline",
              marginRight: 7,
              verticalAlign: "middle",
            }}
          />
          {open
            ? `Собираем до ${dateText(campaign.closes_at)}`
            : "Приём заказов завершён"}
        </span>
      </div>
      {!open ? (
        <div className="info-banner">
          Сбор закрыт. Новые заказы в этой закупке больше не принимаются.
        </div>
      ) : null}
      <div className="shop-grid">
        {products.map((p) => (
          <article className="shop-product" key={p.id}>
            <div className="catalog-image">
              <Photo src={p.image} alt={p.name} />
            </div>
            <div className="shop-product-info">
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <div className="shop-product-bottom">
                <strong>{money(p.price)}</strong>
                <Button onClick={() => setSelected(p)} disabled={!open}>
                  <Plus size={16} />
                  Выбрать
                </Button>
              </div>
              <small>
                {p.sizes.join(" / ")} · {p.colors.join(", ")}
              </small>
            </div>
          </article>
        ))}
      </div>
      {!products.length ? (
        <Empty title="Товары скоро появятся">
          <p>Организатор пока готовит закупку.</p>
        </Empty>
      ) : null}
      <div className="shop-footer">
        <Package
          size={17}
          style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }}
        />
        {workspace.pickup}
      </div>
      <p className="shop-footer">
        Оформление заказа не списывает деньги. Оплату подтверждает организатор.
      </p>
      {cart.length ? (
        <div className="cart-bar">
          <div>
            <ShoppingBag size={23} />
            <div>
              <strong>{money(total)}</strong>
              <small>{count} шт. в вашем заказе</small>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setCheckout(true);
            }}
          >
            Оформить заказ <ArrowRight size={16} />
          </Button>
        </div>
      ) : null}
      {selected ? (
        <Variant
          key={selected.id}
          product={selected}
          onClose={() => {
            setSelected(null);
            setError("");
          }}
          onAdd={add}
          error={error}
          disabled={!open || cart.length >= 20}
        />
      ) : null}
      {checkout ? (
        <Modal
          title="Ваш заказ"
          onClose={() => {
            if (!busy) setCheckout(false);
          }}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !cart.length) return;
              const f = new FormData(e.currentTarget),
                d = {
                  campaignId: campaign.id,
                  customer: f.get("customer"),
                  phone: f.get("phone"),
                  comment: f.get("comment"),
                  consent: f.get("consent") === "on",
                  items: cart.map((i) => ({
                    productId: i.product.id,
                    size: i.size,
                    color: i.color,
                    quantity: i.quantity,
                  })),
                };
              const payload = JSON.stringify(d);
              if (attempt.current?.payload !== payload)
                attempt.current = { payload, key: crypto.randomUUID() };
              setBusy(true);
              setError("");
              try {
                const result = await request<{ token: string }>(
                  "/api/checkout",
                  "POST",
                  { ...d, idempotencyKey: attempt.current.key },
                );
                location.assign(`/order/${result.token}`);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Не удалось оформить заказ",
                );
                setBusy(false);
              }
            }}
          >
            {cart.map((i, n) => (
              <div
                className="cart-item"
                key={`${i.product.id}-${i.color}-${i.size}`}
              >
                <Photo src={i.product.image} alt={i.product.name} />
                <div>
                  <strong>{i.product.name}</strong>
                  <small>
                    {i.size} / {i.color} / {i.quantity} шт.
                  </small>
                </div>
                <strong>{money(i.product.price * i.quantity)}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Убрать ${i.product.name}`}
                  disabled={busy}
                  onClick={() =>
                    setCart((prev) => prev.filter((_, j) => j !== n))
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <div className="checkout-total">
              <span>Итого</span>
              <strong>{money(total)}</strong>
            </div>
            <p className="checkout-note">
              Самовывоз. {workspace.pickup}. Дополнительные сборы в этой версии
              не включены.
            </p>
            <Field label="Ваше имя">
              <input
                name="customer"
                autoComplete="given-name"
                placeholder="Как к вам обращаться"
                minLength={2}
                maxLength={80}
                required
              />
            </Field>
            <Field
              label="Номер телефона"
              hint="Организатор использует его, чтобы связаться с вами по заказу."
            >
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+7 700 123 45 67"
                required
              />
            </Field>
            <Field label="Комментарий к заказу">
              <textarea
                name="comment"
                maxLength={500}
                rows={2}
                placeholder="Необязательно"
              />
            </Field>
            <label className="checkbox">
              <input name="consent" type="checkbox" required />
              Согласен передать имя, телефон и состав заказа организатору{" "}
              {workspace.name} для обработки и выдачи покупки.
            </label>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
            <Button
              busy={busy}
              disabled={!cart.length || !open}
              className="full"
            >
              Подтвердить заказ · {money(total)}
            </Button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
function Variant({
  product,
  onClose,
  onAdd,
  disabled,
  error,
}: {
  product: Product;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
  disabled: boolean;
  error: string;
}) {
  const [size, setSize] = useState(product.sizes[0]),
    [color, setColor] = useState(product.colors[0]),
    [quantity, setQuantity] = useState(1);
  return (
    <Modal title="Выберите вариант" onClose={onClose}>
      <div className="modal-form">
        <div className="variant-preview">
          <Photo src={product.image} alt={product.name} />
          <div>
            <h3>{product.name}</h3>
            <p>{money(product.price)}</p>
          </div>
        </div>
        <span className="choice-label">Размер</span>
        <div className="choices">
          {product.sizes.map((s) => (
            <button
              key={s}
              className={`choice ${s === size ? "selected" : ""}`}
              onClick={() => setSize(s)}
              aria-pressed={s === size}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="choice-label">Цвет</span>
        <div className="choices">
          {product.colors.map((c) => (
            <button
              key={c}
              className={`choice ${c === color ? "selected" : ""}`}
              onClick={() => setColor(c)}
              aria-pressed={c === color}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="choice-label">Количество</span>
        <div className="quantity">
          <button
            aria-label="Уменьшить количество"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => q - 1)}
          >
            −
          </button>
          <span aria-live="polite">{quantity}</span>
          <button
            aria-label="Увеличить количество"
            disabled={quantity >= 20}
            onClick={() => setQuantity((q) => q + 1)}
          >
            +
          </button>
        </div>
        <div className="variant-total">
          <span>Сумма</span>
          <strong>{money(product.price * quantity)}</strong>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          className="full"
          disabled={disabled}
          onClick={() => onAdd({ product, size, color, quantity })}
        >
          <Check size={17} />
          Добавить в заказ
        </Button>
        {disabled ? (
          <p className="checkout-note">
            Сбор закрыт или достигнут предел в 20 вариантов на заказ.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
