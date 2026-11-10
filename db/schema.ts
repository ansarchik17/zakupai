import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  name: text("name").notNull(),
  isDemo: integer("is_demo").notNull().default(0),
  pickup: text("pickup").notNull().default("Место выдачи уточнит организатор"),
  kaspiUrl: text("kaspi_url").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    supplier: text("supplier").notNull().default(""),
    status: text("status").notNull().default("open"),
    closesAt: text("closes_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("campaign_workspace_idx").on(t.workspaceId),
    check(
      "campaign_status_check",
      sql`${t.status} in ('open','closed','completed')`,
    ),
  ],
);
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    price: integer("price").notNull(),
    sizes: text("sizes").notNull(),
    colors: text("colors").notNull(),
    image: text("image").notNull().default(""),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("product_campaign_idx").on(t.campaignId),
    check("product_price_check", sql`${t.price} > 0`),
  ],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    number: text("number").notNull(),
    customer: text("customer").notNull(),
    phone: text("phone").notNull(),
    comment: text("comment").notNull().default(""),
    total: integer("total").notNull(),
    status: text("status").notNull().default("new"),
    source: text("source").notNull().default("web"),
    paymentReported: integer("payment_reported").notNull().default(0),
    publicToken: text("public_token").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("order_idempotency_idx").on(t.campaignId, t.idempotencyKey),
    index("order_workspace_idx").on(t.workspaceId),
    check("order_total_check", sql`${t.total} > 0`),
    check(
      "order_status_check",
      sql`${t.status} in ('new','purchased','received','ready','delivered','cancelled')`,
    ),
  ],
);
export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    size: text("size").notNull(),
    color: text("color").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    image: text("image").notNull().default(""),
  },
  (t) => [
    index("items_order_idx").on(t.orderId),
    check("item_quantity_check", sql`${t.quantity} > 0`),
    check("item_price_check", sql`${t.unitPrice} > 0`),
  ],
);
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    amount: integer("amount").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actor: text("actor").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("payment_idempotency_idx").on(t.orderId, t.idempotencyKey),
    check("payment_amount_check", sql`${t.amount} > 0`),
  ],
);
export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    orderId: text("order_id"),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("activity_workspace_idx").on(t.workspaceId)],
);
