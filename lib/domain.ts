import { z } from "zod";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const label = z.string().trim().min(1).max(80);
export const workspaceInput = z
  .object({ name: label, demo: z.boolean().default(false) })
  .strict();
export const settingsInput = z
  .object({
    name: label,
    pickup: z.string().trim().min(1).max(300),
    kaspiUrl: z
      .string()
      .trim()
      .max(500)
      .refine((s) => {
        if (!s) return true;
        try {
          const u = new URL(s);
          return (
            u.protocol === "https:" &&
            u.hostname === "kaspi.kz" &&
            !u.username &&
            !u.password
          );
        } catch {
          return false;
        }
      }, "Укажите ссылку https://kaspi.kz/… из Kaspi Pay"),
  })
  .strict();
export const campaignInput = z
  .object({
    name: label,
    supplier: z.string().trim().max(100).default(""),
    closesAt: z.string().datetime(),
  })
  .strict();
export const productInput = z
  .object({
    campaignId: z.string().uuid(),
    name: label,
    description: z.string().trim().max(1500).default(""),
    price: z.number().int().min(1).max(10000000),
    sizes: z.array(label).min(1).max(30),
    colors: z.array(label).min(1).max(30),
    image: z
      .string()
      .max(1000)
      .default("")
      .refine(
        (s) =>
          !s ||
          /^\/products\/[a-z0-9-]+\.(jpg|webp|png)$/.test(s) ||
          /^https:\/\//.test(s),
        "Используйте ссылку на изображение с https",
      ),
  })
  .strict();
export const checkoutInput = z
  .object({
    campaignId: z.string().uuid(),
    customer: z.string().trim().min(2).max(80),
    phone: z
      .string()
      .transform((s) => s.replace(/\D/g, ""))
      .refine(
        (s) => /^[78]\d{10}$/.test(s),
        "Укажите телефон в формате +7 700 123 45 67",
      )
      .transform((s) => "7" + s.slice(1)),
    comment: z.string().trim().max(500).default(""),
    consent: z.literal(true),
    idempotencyKey: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            size: label,
            color: label,
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutInput>;
export const paymentInput = z
  .object({
    amount: z.number().int().min(1).max(100000000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const statusInput = z
  .object({
    status: z.enum([
      "new",
      "purchased",
      "received",
      "ready",
      "delivered",
      "cancelled",
    ]),
    expectedStatus: z.string(),
  })
  .strict();
export const statusLabels: Record<string, string> = {
  new: "Новый",
  purchased: "Выкуплен",
  received: "Получен",
  ready: "К выдаче",
  delivered: "Выдан",
  cancelled: "Отменён",
};
export const nextStatuses: Record<string, string[]> = {
  new: ["purchased", "cancelled"],
  purchased: ["received", "cancelled"],
  received: ["ready"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};
export const money = (amount: number) =>
  new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(amount) +
  " ₸";
export function paymentStatus(paid: number, total: number) {
  return paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
}
export const paymentLabels: Record<string, string> = {
  paid: "Оплачено",
  partial: "Частичная оплата",
  unpaid: "Ожидает оплату",
};
export function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value);
            if (typeof value === "string" && /^[\s]*[=+\-@]/.test(s))
              s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
export type Workspace = {
  id: string;
  owner_id: string;
  name: string;
  is_demo: number;
  pickup: string;
  kaspi_url: string;
  created_at: string;
};
export type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  supplier: string;
  status: string;
  closes_at: string;
  created_at: string;
};
export type Product = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  name: string;
  description: string;
  price: number;
  sizes: string[];
  colors: string[];
  image: string;
  active: number;
};
export type Item = {
  id: string;
  product_id: string;
  name: string;
  size: string;
  color: string;
  quantity: number;
  unit_price: number;
  image: string;
};
export type Order = {
  id: string;
  campaign_id: string;
  number: string;
  customer: string;
  phone: string;
  comment: string;
  total: number;
  paid: number;
  status: string;
  source: string;
  payment_reported: number;
  created_at: string;
  items: Item[];
};
export type DashboardData = {
  workspace: Workspace;
  campaigns: Campaign[];
  products: Product[];
  orders: Order[];
  activity: { id: string; action: string; actor: string; created_at: string }[];
};
export type ProcurementRow = {
  productId: string;
  name: string;
  image: string;
  color: string;
  size: string;
  quantity: number;
  paidQuantity: number;
};
export function procurement(
  orders: Order[],
  campaignId?: string,
): ProcurementRow[] {
  const grouped = new Map<string, ProcurementRow>();
  for (const order of orders) {
    if (
      order.status === "cancelled" ||
      (campaignId && order.campaign_id !== campaignId)
    )
      continue;
    for (const item of order.items) {
      const key = JSON.stringify([item.product_id, item.color, item.size]);
      const row = grouped.get(key) ?? {
        productId: item.product_id,
        name: item.name,
        image: item.image,
        color: item.color,
        size: item.size,
        quantity: 0,
        paidQuantity: 0,
      };
      row.quantity += item.quantity;
      if (order.paid >= order.total) row.paidQuantity += item.quantity;
      grouped.set(key, row);
    }
  }
  return [...grouped.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "ru") ||
      a.color.localeCompare(b.color, "ru") ||
      a.size.localeCompare(b.size, "ru", { numeric: true }),
  );
}
