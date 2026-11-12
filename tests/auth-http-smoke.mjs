import assert from "node:assert/strict";
const base = process.env.ZAKUPAI_TEST_URL || "http://127.0.0.1:3200";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Auth smoke разрешён только для локальной тестовой базы");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log("Ready for test administrator JSON on stdin (input is hidden).");
let input = "";
for await (const chunk of process.stdin) {
  input += chunk.toString();
  if (input.includes("\n")) break;
  if (input.length > 8192) throw new Error("Input too large");
}
if (process.stdin.isTTY) process.stdin.setRawMode(false);
const credentials = JSON.parse(input.trim());
const cookieOf = (r) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
async function api(
  path,
  { method = "GET", data, cookie, status = 200, origin } = {},
) {
  const response = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path.split("/").slice(0, 4).join("/")}: unexpected response`,
  );
  const content = await response.text();
  return {
    response,
    body: response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(content)
      : content,
  };
}
await api("/admin", { status: 307 });
await api("/api/admin", { status: 401 });
await api("/api/auth/login", {
  method: "POST",
  data: credentials,
  origin: "https://untrusted.invalid",
  status: 403,
});
const login = await api("/api/auth/login", {
  method: "POST",
  data: credentials,
});
assert.equal(login.body.next, "/admin");
assert.match(login.response.headers.get("set-cookie"), /HttpOnly/);
assert.match(login.response.headers.get("set-cookie"), /SameSite=Lax/);
const admin = cookieOf(login.response);
assert.ok(
  (await api("/admin", { cookie: admin })).body.includes(
    "Пригласить организатора",
  ),
);
assert.ok(
  (await api("/login", { cookie: admin, status: 307 })).response.headers
    .get("location")
    .endsWith("/admin"),
);
const overview = await api("/api/admin", { cookie: admin });
assert.equal(JSON.stringify(overview.body).includes("password_hash"), false);
const email = `smoke-${crypto.randomUUID()}@example.test`,
  password = "SmokePassword+123";
const created = await api("/api/admin/invitations", {
  method: "POST",
  cookie: admin,
  data: {
    email,
    name: "Тестовый организатор",
    workspaceName: "HTTP тест",
    sendEmail: false,
  },
});
assert.equal(created.body.delivery, "not_sent");
const invitePath = new URL(created.body.url).pathname,
  token = invitePath.split("/").at(-1);
assert.ok((await api(invitePath)).body.includes("Тестовый организатор"));
const accepted = await api("/api/auth/accept", {
  method: "POST",
  data: { token, password },
});
const organizer = cookieOf(accepted.response);
await api("/api/auth/login", {
  method: "POST",
  data: { email, password: credentials.password },
  status: 401,
});
await api("/api/admin", { cookie: organizer, status: 403 });
await api("/api/admin/invitations", {
  method: "POST",
  cookie: organizer,
  data: {
    email: "intruder@example.test",
    name: "Intruder",
    workspaceName: "Intruder",
  },
  status: 403,
});
const workspace = (await api("/api/workspace", { cookie: organizer })).body
  .data;
assert.equal(workspace.workspace.name, "HTTP тест");
assert.equal(workspace.orders.length, 0);
assert.ok((await api("/", { cookie: organizer })).body.includes("HTTP тест"));
await api("/api/auth/accept", {
  method: "POST",
  data: { token, password },
  status: 404,
});
assert.ok((await api(invitePath)).body.includes("Ссылка больше не действует"));
const user = (await api("/api/admin", { cookie: admin })).body.users.find(
  (u) => u.email === email,
);
assert.ok(user);
const campaignId = (
  await api("/api/campaigns", {
    method: "POST",
    cookie: organizer,
    data: {
      name: "Проверка изоляции",
      closesAt: new Date(Date.now() + 86400000).toISOString(),
    },
  })
).body.id;
const productId = (
  await api("/api/products", {
    method: "POST",
    cookie: organizer,
    data: {
      campaignId,
      name: "Тестовый товар",
      price: 10000,
      sizes: ["M"],
      colors: ["Белый"],
    },
  })
).body.id;
const order = (
  await api("/api/checkout", {
    method: "POST",
    data: {
      campaignId,
      customer: "Тестовый покупатель",
      phone: "70000000000",
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      items: [{ productId, size: "M", color: "Белый", quantity: 1 }],
    },
  })
).body;
assert.equal((await api(`/api/order/${order.token}`)).body.order.total, 10000);
assert.equal(
  (await api("/api/workspace", { cookie: admin })).body.data?.orders.some(
    (o) => o.id === order.id,
  ) || false,
  false,
);
await api(`/api/orders/${order.id}/payments`, {
  method: "POST",
  cookie: admin,
  data: { amount: 1000, idempotencyKey: crypto.randomUUID() },
  status: 404,
});
const reset = await api(`/api/admin/users/${user.id}/reset`, {
  method: "POST",
  cookie: admin,
  status: 503,
});
assert.equal("url" in reset.body, false);
assert.equal("token" in reset.body, false);
await api(`/api/admin/users/${user.id}`, {
  method: "PATCH",
  cookie: admin,
  data: { email: credentials.email },
  status: 400,
});
await api(`/api/admin/users/${user.id}`, {
  method: "PATCH",
  cookie: admin,
  data: { password: credentials.password },
  status: 400,
});
await api("/api/admin/invitations", {
  method: "POST",
  cookie: admin,
  data: {
    email,
    name: "Нельзя заменить аккаунт",
    workspaceName: "Тест",
    sendEmail: false,
  },
  status: 409,
});
await api("/api/workspace", { cookie: organizer });
await api(`/api/admin/users/${user.id}`, {
  method: "PATCH",
  cookie: admin,
  data: { active: false },
});
await api("/api/workspace", { cookie: organizer, status: 401 });
await api("/api/auth/login", {
  method: "POST",
  data: { email, password },
  status: 401,
});
await api(`/api/admin/users/${user.id}`, {
  method: "PATCH",
  cookie: admin,
  data: { active: true },
});
await api("/api/auth/login", {
  method: "POST",
  data: { email, password },
});
const revocable = (
  await api("/api/admin/invitations", {
    method: "POST",
    cookie: admin,
    data: {
      email: `revoke-${crypto.randomUUID()}@example.test`,
      name: "Отзываемое приглашение",
      workspaceName: "Тест",
      sendEmail: false,
    },
  })
).body;
const revocableToken = new URL(revocable.url).pathname.split("/").at(-1);
const pending = (
  await api("/api/admin", { cookie: admin })
).body.invitations.find(
  (i) => i.name === "Отзываемое приглашение" && !i.revoked_at,
);
await api(`/api/admin/invitations/${pending.id}`, {
  method: "DELETE",
  cookie: admin,
});
await api("/api/auth/accept", {
  method: "POST",
  data: { token: revocableToken, password },
  status: 404,
});
// Run the original procurement flow in the same isolated database as well.
const existingAdminWorkspace = (await api("/api/workspace", { cookie: admin }))
  .body.data;
if (existingAdminWorkspace && !existingAdminWorkspace.workspace.is_demo)
  throw new Error(
    "Для полного HTTP теста нужна отдельная локальная база с демо-пространством администратора",
  );
if (!existingAdminWorkspace)
  await api("/api/workspace", {
    method: "POST",
    cookie: admin,
    data: { name: "Демонстрация HTTP", demo: true },
  });
process.env.ZAKUPAI_TEST_URL = base;
process.env.ZAKUPAI_TEST_EMAIL = credentials.email;
process.env.ZAKUPAI_TEST_PASSWORD = credentials.password;
await import("./http-smoke.mjs");
await api("/api/auth/logout", { method: "POST", cookie: admin });
await api("/api/admin", { cookie: admin, status: 401 });
console.log(
  "Auth HTTP smoke: вход, cookie, SSR, приглашение, отдельное пространство, публичный заказ, изоляция, восстановление, отключение, отзыв и выход — успешно.",
);
process.exit(0);
