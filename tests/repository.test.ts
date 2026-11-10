import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { Repository } from "../lib/repository.ts";
import type { Database } from "../lib/repository.ts";
import { csv, procurement } from "../lib/domain.ts";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  class Prepared {
    sql: string;
    values: (string | number | null)[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...values: unknown[]) {
      this.values = values as (string | number | null)[];
      return this;
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null;
    }
    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.values) as T[] };
    }
    execute() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      return { meta: { changes: Number(result.changes) } };
    }
    async run() {
      return this.execute();
    }
  }
  const db = {
    prepare: (sql: string) => new Prepared(sql),
    batch: async (statements: Prepared[]) => {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as Database;
  return { sqlite, db, repo: new Repository(db) };
}
async function fixture() {
  const f = setup();
  await f.repo.createWorkspace("owner-a", { name: "Тестовая группа" });
  const campaignId = await f.repo.createCampaign("owner-a", {
    name: "Обувь",
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const productId = await f.repo.createProduct("owner-a", {
    campaignId,
    name: "Кроссовки",
    price: 14500,
    sizes: ["38", "39"],
    colors: ["Белый", "Чёрный"],
  });
  const input = () => ({
    campaignId,
    customer: "Тестовый покупатель",
    phone: "70000000001",
    consent: true as const,
    idempotencyKey: crypto.randomUUID(),
    items: [{ productId, size: "38", color: "Белый", quantity: 2 }],
  });
  return { ...f, campaignId, productId, input };
}

test("цена считается на сервере, а снимок заказа переживает изменение каталога", async () => {
  const f = await fixture();
  const result = await f.repo.createOrder(f.input());
  f.sqlite
    .prepare("UPDATE products SET price=1,name='Другое название' WHERE id=?")
    .run(f.productId);
  const { order } = await f.repo.publicOrder(result.token);
  assert.equal(order.total, 29000);
  assert.equal(order.items[0].unit_price, 14500);
  assert.equal(order.items[0].name, "Кроссовки");
  await assert.rejects(() => f.repo.createOrder({ ...f.input(), total: 1 }));
  f.sqlite.close();
});
test("повтор запроса не дублирует заказ, позиции или событие", async () => {
  const f = await fixture(),
    input = f.input();
  const [a, b] = await Promise.all([
    f.repo.createOrder(input),
    f.repo.createOrder(input),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.token, b.token);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders").get()!.n, 1);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM order_items").get()!.n,
    1,
  );
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM activity").get()!.n, 1);
  await assert.rejects(() =>
    f.repo.createOrder({ ...input, customer: "Другой покупатель" }),
  );
  f.sqlite.close();
});
test("закрытая и просроченная закупки не принимают новые заказы", async () => {
  const f = await fixture();
  await f.repo.setCampaign("owner-a", f.campaignId, "closed");
  await assert.rejects(() => f.repo.createOrder(f.input()));
  await f.repo.setCampaign("owner-a", f.campaignId, "open");
  f.sqlite
    .prepare("UPDATE campaigns SET closes_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", f.campaignId);
  await assert.rejects(() => f.repo.createOrder(f.input()));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders").get()!.n, 0);
  f.sqlite.close();
});
test("размер, цвет и количество проверяются до записи", async () => {
  const f = await fixture();
  for (const patch of [
    { size: "100" },
    { color: "Красный" },
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 21 },
  ]) {
    const d = f.input();
    await assert.rejects(() =>
      f.repo.createOrder({ ...d, items: [{ ...d.items[0], ...patch }] }),
    );
  }
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders").get()!.n, 0);
  f.sqlite.close();
});
test("организатор не читает и не изменяет данные другого пространства", async () => {
  const f = await fixture(),
    o = await f.repo.createOrder(f.input());
  await f.repo.createWorkspace("owner-b", { name: "Другая группа" });
  assert.equal((await f.repo.dashboard("owner-b"))!.orders.length, 0);
  await assert.rejects(() =>
    f.repo.pay("owner-b", o.id, {
      amount: 100,
      idempotencyKey: crypto.randomUUID(),
    }),
  );
  await assert.rejects(() =>
    f.repo.setOrderStatus("owner-b", o.id, {
      expectedStatus: "new",
      status: "purchased",
    }),
  );
  await assert.rejects(() =>
    f.repo.toggleProduct("owner-b", f.productId, false),
  );
  await assert.rejects(() => f.repo.createOrder(f.input(), "owner-b"));
  assert.equal((await f.repo.publicOrder(o.token)).order.paid, 0);
  f.sqlite.close();
});
test("частичная оплата, повторы и конкурентные подтверждения не создают переплату", async () => {
  const f = await fixture(),
    o = await f.repo.createOrder(f.input()),
    first = { amount: 5000, idempotencyKey: crypto.randomUUID() };
  await f.repo.pay("owner-a", o.id, first);
  await f.repo.pay("owner-a", o.id, first);
  assert.equal((await f.repo.publicOrder(o.token)).order.paid, 5000);
  await assert.rejects(() =>
    f.repo.pay("owner-a", o.id, {
      amount: 25000,
      idempotencyKey: crypto.randomUUID(),
    }),
  );
  const attempts = await Promise.allSettled([
    f.repo.pay("owner-a", o.id, {
      amount: 20000,
      idempotencyKey: crypto.randomUUID(),
    }),
    f.repo.pay("owner-a", o.id, {
      amount: 20000,
      idempotencyKey: crypto.randomUUID(),
    }),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.repo.publicOrder(o.token)).order.paid, 25000);
  f.sqlite.close();
});
test("сообщение покупателя об оплате не подтверждает деньги", async () => {
  const f = await fixture(),
    o = await f.repo.createOrder(f.input());
  await f.repo.reportPayment(o.token);
  const result = await f.repo.publicOrder(o.token);
  assert.equal(result.order.payment_reported, 1);
  assert.equal(result.order.paid, 0);
  assert.equal(result.order.status, "new");
  await assert.rejects(() => f.repo.publicOrder("неверный-токен"));
  f.sqlite.close();
});
test("выдача требует оплаты, переходы последовательны, устаревшее состояние отклоняется", async () => {
  const f = await fixture(),
    o = await f.repo.createOrder(f.input());
  await assert.rejects(() =>
    f.repo.setOrderStatus("owner-a", o.id, {
      expectedStatus: "new",
      status: "delivered",
    }),
  );
  for (const [expectedStatus, status] of [
    ["new", "purchased"],
    ["purchased", "received"],
    ["received", "ready"],
  ])
    await f.repo.setOrderStatus("owner-a", o.id, { expectedStatus, status });
  await assert.rejects(() =>
    f.repo.setOrderStatus("owner-a", o.id, {
      expectedStatus: "new",
      status: "purchased",
    }),
  );
  await assert.rejects(() =>
    f.repo.setOrderStatus("owner-a", o.id, {
      expectedStatus: "ready",
      status: "delivered",
    }),
  );
  await f.repo.pay("owner-a", o.id, {
    amount: 29000,
    idempotencyKey: crypto.randomUUID(),
  });
  await f.repo.setOrderStatus("owner-a", o.id, {
    expectedStatus: "ready",
    status: "delivered",
  });
  assert.equal((await f.repo.publicOrder(o.token)).order.status, "delivered");
  assert.equal(
    f.sqlite
      .prepare("SELECT COUNT(*) n FROM activity WHERE action LIKE '%Выдан%'")
      .get()!.n,
    1,
  );
  f.sqlite.close();
});
test("закупка не завершается с невыданными заказами, оплаченный заказ не отменяется без возврата", async () => {
  const f = await fixture(),
    o = await f.repo.createOrder(f.input());
  await f.repo.setCampaign("owner-a", f.campaignId, "closed");
  await assert.rejects(() =>
    f.repo.setCampaign("owner-a", f.campaignId, "completed"),
  );
  await f.repo.pay("owner-a", o.id, {
    amount: 1000,
    idempotencyKey: crypto.randomUUID(),
  });
  await assert.rejects(() =>
    f.repo.setOrderStatus("owner-a", o.id, {
      expectedStatus: "new",
      status: "cancelled",
    }),
  );
  assert.equal((await f.repo.publicOrder(o.token)).order.status, "new");
  f.sqlite.close();
});
test("выкуп различает цвета и размеры, исключает отмены и частично оплаченные единицы", async () => {
  const f = await fixture();
  const a = await f.repo.createOrder(f.input());
  await f.repo.pay("owner-a", a.id, {
    amount: 29000,
    idempotencyKey: crypto.randomUUID(),
  });
  const d = f.input();
  await f.repo.createOrder({
    ...d,
    items: [{ ...d.items[0], color: "Чёрный", quantity: 1 }],
  });
  const b = await f.repo.createOrder(f.input());
  await f.repo.setOrderStatus("owner-a", b.id, {
    expectedStatus: "new",
    status: "cancelled",
  });
  const rows = procurement((await f.repo.dashboard("owner-a"))!.orders);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.color === "Белый")!.quantity, 2);
  assert.equal(rows.find((r) => r.color === "Белый")!.paidQuantity, 2);
  assert.equal(rows.find((r) => r.color === "Чёрный")!.quantity, 1);
  assert.equal(rows.find((r) => r.color === "Чёрный")!.paidQuantity, 0);
  f.sqlite.close();
});
test("экспорт экранирует формулы и кавычки", () => {
  const text = csv([['=HYPERLINK("test")', "+123", "Обычный; текст", 42]]);
  assert.ok(text.startsWith("\uFEFF"));
  assert.ok(text.includes('"\'=HYPERLINK(""test"")"'));
  assert.ok(text.includes('"\'+123"'));
  assert.ok(text.includes('"Обычный; текст"'));
  assert.ok(text.includes('"42"'));
});

test("повторяющиеся строки не обходят ограничение количества варианта", async () => {
  const f = await fixture(),
    d = f.input();
  await assert.rejects(() =>
    f.repo.createOrder({
      ...d,
      items: [
        { ...d.items[0], quantity: 15 },
        { ...d.items[0], quantity: 10 },
      ],
    }),
  );
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders").get()!.n, 0);
  f.sqlite.close();
});
