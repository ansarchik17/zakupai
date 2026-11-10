import assert from "node:assert/strict";
const base = process.env.ZAKUPAI_TEST_URL || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Тест предназначен только для локального демо");
const login = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
assert.ok(cookie, "Не получен локальный вход");
async function api(
  path,
  { method = "GET", body, auth = false, status = 200, headers = {} } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(auth ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${text.slice(0, 250)}`,
  );
  return response.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(text)
    : text;
}
await api("/api/workspace", { status: 401 });
let { data } = await api("/api/workspace", { auth: true });
if (!data)
  ({ data } = await api("/api/workspace", {
    method: "POST",
    auth: true,
    body: { name: "Доступный шоппинг", demo: true },
  }));
assert.equal(
  data.workspace.is_demo,
  1,
  "Тестовые заказы можно создавать только в демо-пространстве",
);
assert.ok(data.products.length >= 1);
const p = data.products.find((p) => p.active),
  c = data.campaigns.find((c) => c.id === p.campaign_id);
assert.equal(c.status, "open", "Для теста нужна открытая демо-закупка");
const dashboard = await api("/", { auth: true });
assert.ok(dashboard.includes("Последние заказы"));
const shop = await api(`/c/${c.id}`);
assert.ok(shop.includes(p.name));
const input = {
  campaignId: c.id,
  customer: "Проверка HTTP",
  phone: "70000000000",
  consent: true,
  idempotencyKey: crypto.randomUUID(),
  items: [
    { productId: p.id, size: p.sizes[0], color: p.colors[0], quantity: 2 },
  ],
};
await api("/api/checkout", {
  method: "POST",
  body: input,
  headers: { Origin: "https://untrusted.invalid" },
  status: 403,
});
await api("/api/orders", { method: "POST", body: input, status: 401 });
const order = await api("/api/checkout", { method: "POST", body: input });
assert.equal(
  (await api("/api/checkout", { method: "POST", body: input })).id,
  order.id,
);
const statusPage = await api(`/order/${order.token}`);
assert.ok(statusPage.includes(order.number));
await api(`/api/order/${order.token}`, { method: "POST" });
let details = await api(`/api/order/${order.token}`);
assert.equal(details.order.paid, 0);
assert.equal(details.order.payment_reported, 1);
const payment = { amount: 1000, idempotencyKey: crypto.randomUUID() };
await api(`/api/orders/${order.id}/payments`, {
  method: "POST",
  body: payment,
  status: 401,
});
await api(`/api/orders/${order.id}/payments`, {
  method: "POST",
  auth: true,
  body: payment,
});
await api(`/api/orders/${order.id}/payments`, {
  method: "POST",
  auth: true,
  body: payment,
});
details = await api(`/api/order/${order.token}`);
assert.equal(details.order.paid, 1000);
assert.equal(details.order.total, p.price * 2);
await api(`/api/orders/${order.id}`, {
  method: "PATCH",
  auth: true,
  body: { expectedStatus: "new", status: "purchased" },
});
assert.equal(
  (await api(`/api/order/${order.token}`)).order.status,
  "purchased",
);
const updated = await api("/api/workspace", { auth: true });
assert.equal(updated.data.orders.filter((o) => o.id === order.id).length, 1);
await api(`/api/campaigns/${c.id}`, {
  method: "PATCH",
  auth: true,
  body: { status: "closed" },
});
try {
  await api("/api/checkout", {
    method: "POST",
    body: { ...input, idempotencyKey: crypto.randomUUID() },
    status: 409,
  });
} finally {
  await api(`/api/campaigns/${c.id}`, {
    method: "PATCH",
    auth: true,
    body: { status: "open" },
  });
}
await api("/api/export", { status: 401 });
const exported = await api("/api/export?type=procurement", { auth: true });
assert.ok(exported.includes("Полностью оплачено"));
console.log(
  "HTTP smoke: вход, SSR, D1, оформление, повторы, оплата, закрытие сбора, доступ и экспорт — успешно",
);
