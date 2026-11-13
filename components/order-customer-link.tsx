"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button, Field, request } from "./primitives";

export function OrderCustomerLink({ orderId, initialPath }: {
  orderId: string;
  initialPath?: string;
}) {
  const [url, setUrl] = useState(() => initialPath && typeof location !== "undefined"
    ? new URL(initialPath, location.origin).href : "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="customer-order-link">
      <strong>Ссылка покупателю</strong>
      <p className="muted small-text">По ней покупатель увидит состав, оплату и статус своего заказа без регистрации. Отправляйте её только владельцу заказа.</p>
      {url ? <>
        <Field label="Адрес заказа">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div className="link-actions">
          <Button type="button" variant="secondary" onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setError("");
            } catch {
              setError("Выделите и скопируйте адрес из поля выше.");
            }
          }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Скопировано" : "Скопировать ссылку"}
          </Button>
          <a className="text-link" href={url} target="_blank" rel="noreferrer">
            Открыть заказ <ExternalLink size={15} />
          </a>
        </div>
      </> : <Button type="button" variant="secondary" busy={busy} onClick={async () => {
        setBusy(true);
        setError("");
        try {
          const result = await request<{ path: string }>(`/api/orders/${orderId}/link`);
          setUrl(new URL(result.path, location.origin).href);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Не удалось получить ссылку");
        } finally {
          setBusy(false);
        }
      }}>Получить ссылку покупателя</Button>}
      {error ? <p role="alert" className="error">{error}</p> : null}
    </div>
  );
}
