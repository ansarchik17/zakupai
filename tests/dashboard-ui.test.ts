import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import type { Order } from "../lib/domain.ts";
import { Repository } from "../lib/repository.ts";
import { testDatabase } from "./helpers/database.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLDialogElement", "Node", "MutationObserver", "location", "history", "getComputedStyle", "FormData"])
  Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as unknown as Record<string, unknown>)[key] });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
const { render, screen, within, waitFor, cleanup, act, fireEvent } = await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
mkdirSync("work", { recursive: true });
const directory = mkdtempSync(resolve("work/component-tests-"));
const outfile = resolve(directory, "components.mjs");
await build({
  stdin: { contents: 'export {OrderDetails} from "./components/dashboard-forms"; export {Dashboard} from "./components/dashboard";', resolveDir: process.cwd(), loader: "tsx" },
  outfile, bundle: true, packages: "external", platform: "node", format: "esm", jsx: "automatic",
  plugins: [{ name: "test-navigation", setup(build) {
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const useRouter=()=>({replace(){},refresh(){}});" }));
  } }],
});
const { OrderDetails, Dashboard } = await import(pathToFileURL(outfile).href);
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; history.replaceState({}, "", "/"); });
after(() => { dom.window.close(); rmSync(directory, { recursive: true, force: true }); });

async function fixture() {
  const { db, sqlite } = testDatabase(), repo = new Repository(db);
  await repo.createWorkspace("ui-owner", { name: "Тестовая группа" });
  const campaignId = await repo.createCampaign("ui-owner", { name: "Тестовая закупка", closesAt: new Date(Date.now() + 86400000).toISOString() });
  const productId = await repo.createProduct("ui-owner", { campaignId, name: "Тестовый товар", price: 10000, sizes: ["M"], colors: ["Белый"] });
  const input = { campaignId, customer: "Тестовый покупатель", phone: "70000000001", consent: true, idempotencyKey: crypto.randomUUID(), items: [{ productId, size: "M", color: "Белый", quantity: 1 }] };
  const created = await repo.createOrder(input, "ui-owner");
  return { repo, sqlite, created, input, data: (await repo.dashboard("ui-owner"))! };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
async function enterPayment(user: ReturnType<typeof userEvent.setup>, amount: number) {
  const input = screen.getByRole("spinbutton", { name: "Сумма поступившей оплаты" });
  await user.clear(input);
  await user.type(input, String(amount));
  await user.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
}
function detailProps(order: Order) {
  return { order, campaignName: "Тестовая закупка", busy: false, error: "", onClose() {}, onStatus: async () => true };
}

test("форма принимает две равные частичные оплаты в одном открытом заказе", async () => {
  const f = await fixture(), keys: string[] = [];
  try {
    function Harness() {
      const [order, setOrder] = useState(f.data.orders[0]);
      return React.createElement(OrderDetails, { ...detailProps(order), onPay: async (input: { idempotencyKey: string }) => {
        keys.push(input.idempotencyKey);
        const receipt = await f.repo.pay("ui-owner", order.id, input);
        setOrder((o) => ({ ...o, paid: receipt.paid }));
        return true;
      } });
    }
    render(React.createElement(Harness));
    const user = userEvent.setup();
    await enterPayment(user, 5000);
    await waitFor(() => assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "5000"));
    await user.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
    await waitFor(() => assert.equal(screen.queryByRole("spinbutton"), null));
    assert.equal((await f.repo.publicOrder(f.created.token)).order.paid, 10000);
    assert.equal(new Set(keys).size, 2);
  } finally { f.sqlite.close(); }
});

test("потерянный ответ повторяется с прежним ключом, следующая оплата получает новый", async () => {
  const f = await fixture(), keys: string[] = [];
  try {
    function Harness() {
      const [order, setOrder] = useState(f.data.orders[0]);
      return React.createElement(OrderDetails, { ...detailProps(order), onPay: async (input: { idempotencyKey: string }) => {
        keys.push(input.idempotencyKey);
        const receipt = await f.repo.pay("ui-owner", order.id, input);
        if (keys.length === 1) return false; // Server committed; client did not receive acknowledgement.
        setOrder((o) => ({ ...o, paid: receipt.paid }));
        return true;
      } });
    }
    render(React.createElement(Harness));
    const user = userEvent.setup();
    await enterPayment(user, 5000);
    await user.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
    await waitFor(() => assert.equal(keys.length, 2));
    assert.equal(keys[0], keys[1]);
    assert.equal((await f.repo.publicOrder(f.created.token)).order.paid, 5000);
    await user.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
    await waitFor(() => assert.equal(screen.queryByRole("spinbutton"), null));
    assert.notEqual(keys[1], keys[2]);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM payments").get()!.n, 2);
  } finally { f.sqlite.close(); }
});

test("два синхронных submit во время запроса отправляют одну оплату", async () => {
  const f = await fixture();
  try {
    let calls = 0, finish!: (value: boolean) => void;
    render(React.createElement(OrderDetails, { ...detailProps(f.data.orders[0]), onPay: async () => {
      calls++;
      return new Promise<boolean>((resolve) => { finish = resolve; });
    } }));
    const form = screen.getByRole("button", { name: "Подтвердить оплату" }).closest("form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    assert.equal(calls, 1);
    assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).disabled, true);
    await act(async () => { finish(true); });
  } finally { f.sqlite.close(); }
});

test("Dashboard обновляет баланс по квитанции, когда обновление списка недоступно", async () => {
  const f = await fixture();
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/payments")) return json(await f.repo.pay("ui-owner", f.created.id, JSON.parse(String(init?.body))));
      throw new Error("Соединение прервано");
    };
    render(React.createElement(Dashboard, { initial: f.data, userName: "Тестовый организатор" }));
    const user = userEvent.setup();
    await user.click(screen.getByText(`№${f.created.number}`));
    await enterPayment(user, 5000);
    await waitFor(() => assert.match(screen.getByRole("alert").textContent!, /Действие сохранено/));
    const dialog = within(screen.getByRole("dialog"));
    assert.match(dialog.getByText("Оплата подтверждена").closest("div")!.textContent!, /5[\s\u00a0]?000/);
    assert.equal((dialog.getByRole("spinbutton") as HTMLInputElement).value, "5000");
    await user.click(dialog.getByRole("button", { name: "Подтвердить оплату" }));
    await waitFor(() => assert.equal(dialog.queryByRole("spinbutton"), null));
    assert.equal((await f.repo.publicOrder(f.created.token)).order.paid, 10000);
  } finally { f.sqlite.close(); }
});

test("старое фоновое чтение не отменяет подтверждённую оплату", async () => {
  const f = await fixture();
  try {
    let firstRead!: (response: Response) => void, reads = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/payments")) return json(await f.repo.pay("ui-owner", f.created.id, JSON.parse(String(init?.body))));
      if (String(url) === "/api/workspace") {
        if (++reads === 1) return new Promise<Response>((resolve) => { firstRead = resolve; });
        return json({ data: await f.repo.dashboard("ui-owner") });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    render(React.createElement(Dashboard, { initial: f.data, userName: "Тестовый организатор" }));
    act(() => { window.dispatchEvent(new dom.window.Event("focus")); });
    const user = userEvent.setup();
    await user.click(screen.getByText(`№${f.created.number}`));
    await enterPayment(user, 5000);
    await waitFor(() => assert.equal(reads, 2));
    await act(async () => { firstRead(json({ data: f.data })); });
    assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "5000");
    await user.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
    await waitFor(() => assert.equal(screen.queryByRole("spinbutton"), null));
    assert.equal((await f.repo.publicOrder(f.created.token)).order.paid, 10000);
  } finally { f.sqlite.close(); }
});

test("ручной заказ показывает ссылку при сбое обновления списка и после нового входа", async () => {
  const f = await fixture();
  try {
    let created = f.created;
    globalThis.fetch = async (url, init) => {
      if (String(url) === "/api/orders") {
        created = await f.repo.createOrder(JSON.parse(String(init?.body)), "ui-owner");
        return json(created);
      }
      if (String(url).endsWith("/link")) return json(await f.repo.orderLink("ui-owner", created.id));
      if (String(url) === "/api/workspace") throw new Error("Обновление списка временно недоступно");
      throw new Error(`Unexpected request: ${url}`);
    };
    render(React.createElement(Dashboard, { initial: f.data, userName: "Тестовый организатор" }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Добавить заказ" }));
    await user.type(screen.getByLabelText("Имя покупателя"), "Ручной покупатель");
    await user.type(screen.getByLabelText("Телефон"), "+7 000 000 00 02");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Сохранить заказ" }));
    const address = await screen.findByRole("textbox", { name: "Адрес заказа" });
    const expected = `http://localhost/order/${created.token}`;
    assert.equal((address as HTMLInputElement).value, expected);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Скопировать ссылку" }));
    assert.equal(await navigator.clipboard.readText(), expected);
    cleanup();
    render(React.createElement(Dashboard, { initial: await f.repo.dashboard("ui-owner"), userName: "Тестовый организатор" }));
    await user.click(screen.getByText(`№${created.number}`));
    await user.click(screen.getByRole("button", { name: "Получить ссылку покупателя" }));
    await waitFor(() => assert.equal((screen.getByRole("textbox", { name: "Адрес заказа" }) as HTMLInputElement).value, expected));
  } finally { f.sqlite.close(); }
});
