import {
  AppError,
  nextStatuses,
  statusLabels,
  checkoutInput,
  paymentInput,
  statusInput,
  workspaceInput,
  settingsInput,
  campaignInput,
  productInput,
} from "./domain.ts";
import type {
  Workspace,
  Campaign,
  Product,
  Order,
  Item,
  DashboardData,
} from "./domain.ts";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
};
export type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
};
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const token = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
async function digest(input: unknown) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(input)),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export class Repository {
  private db: Database;
  constructor(db: Database) {
    this.db = db;
  }
  async workspace(owner: string) {
    return this.db
      .prepare("SELECT * FROM workspaces WHERE owner_id = ?")
      .bind(owner)
      .first<Workspace>();
  }
  async requireWorkspace(owner: string) {
    const w = await this.workspace(owner);
    if (!w) throw new AppError("Сначала создайте рабочее пространство", 404);
    return w;
  }
  async createWorkspace(owner: string, input: unknown) {
    const data = workspaceInput.parse(input),
      existing = await this.workspace(owner);
    if (existing) return existing;
    await this.db
      .prepare(
        "INSERT INTO workspaces (id,owner_id,name,is_demo,created_at) VALUES (?,?,?,?,?) ON CONFLICT(owner_id) DO NOTHING",
      )
      .bind(uuid(), owner, data.name, Number(data.demo), now())
      .run();
    return this.requireWorkspace(owner);
  }
  async settings(owner: string, input: unknown) {
    const w = await this.requireWorkspace(owner),
      data = settingsInput.parse(input);
    await this.db
      .prepare(
        "UPDATE workspaces SET name=?,pickup=?,kaspi_url=? WHERE id=? AND owner_id=?",
      )
      .bind(data.name, data.pickup, data.kaspiUrl, w.id, owner)
      .run();
  }
  async createCampaign(owner: string, input: unknown) {
    const w = await this.requireWorkspace(owner),
      data = campaignInput.parse(input);
    if (Date.parse(data.closesAt) <= Date.now())
      throw new AppError("Дата завершения должна быть в будущем");
    const id = uuid();
    await this.db
      .prepare(
        "INSERT INTO campaigns (id,workspace_id,name,supplier,closes_at,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        id,
        w.id,
        data.name,
        data.supplier,
        new Date(data.closesAt).toISOString(),
        now(),
      )
      .run();
    return id;
  }
  async setCampaign(owner: string, id: string, status: string) {
    const w = await this.requireWorkspace(owner);
    if (!["open", "closed", "completed"].includes(status))
      throw new AppError("Неизвестное состояние закупки");
    const c = await this.db
      .prepare("SELECT * FROM campaigns WHERE id=? AND workspace_id=?")
      .bind(id, w.id)
      .first<Campaign>();
    if (!c) throw new AppError("Закупка не найдена", 404);
    if (status === "open" && Date.parse(c.closes_at) <= Date.now())
      throw new AppError("Срок сбора уже закончился. Создайте новую закупку.");
    if (c.status === "completed") throw new AppError("Закупка уже завершена");
    const changed = await this.db
      .prepare(
        "UPDATE campaigns SET status=? WHERE id=? AND workspace_id=? AND (?!='completed' OR NOT EXISTS (SELECT 1 FROM orders WHERE campaign_id=? AND status NOT IN ('delivered','cancelled')))",
      )
      .bind(status, id, w.id, status, id)
      .run();
    if (!changed.meta.changes)
      throw new AppError(
        "Сначала выдайте или отмените все заказы закупки",
        409,
      );
  }
  async createProduct(owner: string, input: unknown) {
    const w = await this.requireWorkspace(owner),
      d = productInput.parse(input);
    if (
      !(await this.db
        .prepare("SELECT id FROM campaigns WHERE id=? AND workspace_id=?")
        .bind(d.campaignId, w.id)
        .first())
    )
      throw new AppError("Закупка не найдена", 404);
    const id = uuid();
    await this.db
      .prepare(
        "INSERT INTO products (id,workspace_id,campaign_id,name,description,price,sizes,colors,image,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        w.id,
        d.campaignId,
        d.name,
        d.description,
        d.price,
        JSON.stringify([...new Set(d.sizes)]),
        JSON.stringify([...new Set(d.colors)]),
        d.image,
        now(),
      )
      .run();
    return id;
  }
  async toggleProduct(owner: string, id: string, active: boolean) {
    const w = await this.requireWorkspace(owner);
    if (
      !(
        await this.db
          .prepare("UPDATE products SET active=? WHERE id=? AND workspace_id=?")
          .bind(Number(active), id, w.id)
          .run()
      ).meta.changes
    )
      throw new AppError("Товар не найден", 404);
  }
  async products(campaignId: string) {
    const { results } = await this.db
      .prepare("SELECT * FROM products WHERE campaign_id=? ORDER BY created_at")
      .bind(campaignId)
      .all<
        Omit<Product, "sizes" | "colors"> & { sizes: string; colors: string }
      >();
    return results.map((p) => ({
      ...p,
      sizes: JSON.parse(p.sizes) as string[],
      colors: JSON.parse(p.colors) as string[],
    }));
  }
  async shop(campaignId: string) {
    const campaign = await this.db
      .prepare("SELECT * FROM campaigns WHERE id=?")
      .bind(campaignId)
      .first<Campaign>();
    if (!campaign) throw new AppError("Закупка не найдена", 404);
    const workspace = await this.db
      .prepare(
        "SELECT name,pickup,kaspi_url,is_demo FROM workspaces WHERE id=?",
      )
      .bind(campaign.workspace_id)
      .first<Pick<Workspace, "name" | "pickup" | "kaspi_url" | "is_demo">>();
    return {
      campaign,
      workspace: workspace!,
      products: (await this.products(campaignId)).filter((p) => p.active),
    };
  }
  async dashboard(owner: string): Promise<DashboardData | null> {
    const workspace = await this.workspace(owner);
    if (!workspace) return null;
    const { results: campaigns } = await this.db
      .prepare(
        "SELECT * FROM campaigns WHERE workspace_id=? ORDER BY created_at DESC",
      )
      .bind(workspace.id)
      .all<Campaign>();
    const products = (
      await Promise.all(campaigns.map((c) => this.products(c.id)))
    ).flat();
    const { results: rows } = await this.db
      .prepare(
        "SELECT o.*,COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id=o.id),0) AS paid FROM orders o WHERE workspace_id=? ORDER BY created_at DESC",
      )
      .bind(workspace.id)
      .all<
        Order & {
          public_token: string;
          fingerprint: string;
          idempotency_key: string;
        }
      >();
    const { results: items } = await this.db
      .prepare(
        "SELECT i.* FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.workspace_id=?",
      )
      .bind(workspace.id)
      .all<Item & { order_id: string }>();
    const orders: Order[] = rows.map(
      ({
        public_token: _token,
        fingerprint: _fingerprint,
        idempotency_key: _key,
        ...o
      }) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }),
    );
    const { results: activity } = await this.db
      .prepare(
        "SELECT id,action,actor,created_at FROM activity WHERE workspace_id=? ORDER BY created_at DESC LIMIT 12",
      )
      .bind(workspace.id)
      .all<DashboardData["activity"][number]>();
    return { workspace, campaigns, products, orders, activity };
  }
  async createOrder(input: unknown, owner?: string) {
    const d = checkoutInput.parse(input),
      fingerprint = await digest({ ...d, idempotencyKey: undefined });
    const campaign = await this.db
      .prepare("SELECT * FROM campaigns WHERE id=?")
      .bind(d.campaignId)
      .first<Campaign>();
    if (!campaign) throw new AppError("Закупка не найдена", 404);
    if (
      owner &&
      (await this.requireWorkspace(owner)).id !== campaign.workspace_id
    )
      throw new AppError("Закупка не найдена", 404);
    const existing = await this.db
      .prepare(
        "SELECT id,public_token,number,fingerprint FROM orders WHERE campaign_id=? AND idempotency_key=?",
      )
      .bind(d.campaignId, d.idempotencyKey)
      .first<{
        id: string;
        public_token: string;
        number: string;
        fingerprint: string;
      }>();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new AppError(
          "Этот запрос уже использован для другого заказа",
          409,
        );
      return {
        id: existing.id,
        token: existing.public_token,
        number: existing.number,
      };
    }
    if (
      campaign.status !== "open" ||
      Date.parse(campaign.closes_at) <= Date.now()
    )
      throw new AppError("Сбор заказов уже закрыт", 409);
    const products = await this.products(d.campaignId);
    let total = 0;
    const quantities = new Map<string, number>();
    const prepared = d.items.map((item) => {
      const variantKey = JSON.stringify([
        item.productId,
        item.size,
        item.color,
      ]);
      const quantity = (quantities.get(variantKey) || 0) + item.quantity;
      if (quantity > 20)
        throw new AppError("Не больше 20 единиц одного варианта на заказ");
      quantities.set(variantKey, quantity);
      const p = products.find((p) => p.id === item.productId && p.active);
      if (!p || !p.sizes.includes(item.size) || !p.colors.includes(item.color))
        throw new AppError(
          "Товар или выбранный вариант недоступен. Обновите страницу.",
          409,
        );
      total += p.price * item.quantity;
      return { ...item, product: p };
    });
    if (total > 100000000)
      throw new AppError("Сумма заказа превышает допустимую");
    const id = uuid(),
      publicToken = token(),
      number = id.slice(0, 8).toUpperCase(),
      time = now();
    const statements = [
      this.db
        .prepare(
          "INSERT INTO orders (id,workspace_id,campaign_id,number,customer,phone,comment,total,source,public_token,idempotency_key,fingerprint,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=? AND status='open' AND closes_at>?) ON CONFLICT(campaign_id,idempotency_key) DO NOTHING",
        )
        .bind(
          id,
          campaign.workspace_id,
          d.campaignId,
          number,
          d.customer,
          d.phone,
          d.comment,
          total,
          owner ? "manual" : "web",
          publicToken,
          d.idempotencyKey,
          fingerprint,
          time,
          d.campaignId,
          time,
        ),
    ];
    for (const item of prepared)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO order_items (id,order_id,product_id,name,size,color,quantity,unit_price,image) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=?)",
          )
          .bind(
            uuid(),
            id,
            item.productId,
            item.product.name,
            item.size,
            item.color,
            item.quantity,
            item.product.price,
            item.product.image,
            id,
          ),
      );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO activity (id,workspace_id,order_id,action,actor,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=?)",
        )
        .bind(
          uuid(),
          campaign.workspace_id,
          id,
          `Новый заказ №${number}`,
          owner ? "Организатор" : "Покупатель",
          time,
          id,
        ),
    );
    await this.db.batch(statements);
    const result = await this.db
      .prepare(
        "SELECT id,public_token,number,fingerprint FROM orders WHERE campaign_id=? AND idempotency_key=?",
      )
      .bind(d.campaignId, d.idempotencyKey)
      .first<{
        id: string;
        public_token: string;
        number: string;
        fingerprint: string;
      }>();
    if (!result) throw new AppError("Сбор заказов уже закрыт", 409);
    if (result.fingerprint !== fingerprint)
      throw new AppError("Запрос уже использован", 409);
    return { id: result.id, token: result.public_token, number: result.number };
  }
  async publicOrder(publicToken: string) {
    if (!/^[a-f0-9]{64}$/.test(publicToken))
      throw new AppError("Заказ не найден", 404);
    const order = await this.db
      .prepare(
        "SELECT o.id,o.number,o.customer,o.comment,o.total,o.status,o.payment_reported,o.created_at,o.workspace_id,o.campaign_id,COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id=o.id),0) AS paid FROM orders o WHERE public_token=?",
      )
      .bind(publicToken)
      .first<Order & { workspace_id: string }>();
    if (!order) throw new AppError("Заказ не найден", 404);
    const { results: items } = await this.db
      .prepare("SELECT * FROM order_items WHERE order_id=?")
      .bind(order.id)
      .all<Item>();
    const workspace = await this.db
      .prepare(
        "SELECT name,pickup,kaspi_url,is_demo FROM workspaces WHERE id=?",
      )
      .bind(order.workspace_id)
      .first<Pick<Workspace, "name" | "pickup" | "kaspi_url" | "is_demo">>();
    return { order: { ...order, items }, workspace: workspace! };
  }
  async reportPayment(publicToken: string) {
    const { order } = await this.publicOrder(publicToken);
    if (order.status === "cancelled") throw new AppError("Заказ отменён", 409);
    await this.db
      .prepare("UPDATE orders SET payment_reported=1 WHERE public_token=?")
      .bind(publicToken)
      .run();
  }
  async pay(owner: string, orderId: string, input: unknown) {
    const w = await this.requireWorkspace(owner),
      d = paymentInput.parse(input);
    const order = await this.db
      .prepare("SELECT * FROM orders WHERE id=? AND workspace_id=?")
      .bind(orderId, w.id)
      .first<Order>();
    if (!order) throw new AppError("Заказ не найден", 404);
    const previous = await this.db
      .prepare(
        "SELECT amount FROM payments WHERE order_id=? AND idempotency_key=?",
      )
      .bind(orderId, d.idempotencyKey)
      .first<{ amount: number }>();
    if (previous) {
      if (previous.amount !== d.amount)
        throw new AppError("Запрос уже использован", 409);
      return;
    }
    const id = uuid(),
      time = now();
    const result = await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO payments (id,order_id,amount,idempotency_key,actor,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id=? AND o.workspace_id=? AND o.status!='cancelled' AND o.total-COALESCE((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0)>=?) ON CONFLICT(order_id,idempotency_key) DO NOTHING",
        )
        .bind(
          id,
          orderId,
          d.amount,
          d.idempotencyKey,
          owner,
          time,
          orderId,
          w.id,
          d.amount,
        ),
      this.db
        .prepare(
          "INSERT INTO activity (id,workspace_id,order_id,action,actor,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM payments WHERE id=?)",
        )
        .bind(
          uuid(),
          w.id,
          orderId,
          `Подтверждена оплата заказа №${order.number}: ${d.amount} ₸`,
          "Организатор",
          time,
          id,
        ),
    ]);
    if (!result[0].meta.changes) {
      const replay = await this.db
        .prepare(
          "SELECT amount FROM payments WHERE order_id=? AND idempotency_key=?",
        )
        .bind(orderId, d.idempotencyKey)
        .first<{ amount: number }>();
      if (replay?.amount !== d.amount)
        throw new AppError(
          "Сумма превышает остаток или заказ отменён. Обновите данные.",
          409,
        );
    }
  }
  async setOrderStatus(owner: string, orderId: string, input: unknown) {
    const w = await this.requireWorkspace(owner),
      d = statusInput.parse(input);
    const order = await this.db
      .prepare(
        "SELECT o.*,COALESCE((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0) AS paid FROM orders o WHERE id=? AND workspace_id=?",
      )
      .bind(orderId, w.id)
      .first<Order>();
    if (!order) throw new AppError("Заказ не найден", 404);
    if (order.status !== d.expectedStatus)
      throw new AppError("Заказ уже изменён. Обновите данные.", 409);
    if (!nextStatuses[order.status]?.includes(d.status))
      throw new AppError("Такое изменение состояния недоступно", 409);
    if (d.status === "cancelled" && order.paid > 0)
      throw new AppError(
        "У заказа есть оплата. Отмену с возвратом добавим отдельной операцией.",
        409,
      );
    if (d.status === "delivered" && order.paid < order.total)
      throw new AppError("Перед выдачей подтвердите полную оплату", 409);
    const time = now();
    const updated = await this.db.batch([
      this.db
        .prepare(
          "UPDATE orders SET status=? WHERE id=? AND workspace_id=? AND status=? AND (?!='cancelled' OR NOT EXISTS(SELECT 1 FROM payments WHERE order_id=?)) AND (?!='delivered' OR total<=COALESCE((SELECT SUM(amount) FROM payments WHERE order_id=?),0))",
        )
        .bind(
          d.status,
          orderId,
          w.id,
          d.expectedStatus,
          d.status,
          orderId,
          d.status,
          orderId,
        ),
      this.db
        .prepare(
          "INSERT INTO activity (id,workspace_id,order_id,action,actor,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0",
        )
        .bind(
          uuid(),
          w.id,
          orderId,
          `Заказ №${order.number}: ${statusLabels[d.status]}`,
          "Организатор",
          time,
        ),
    ]);
    if (!updated[0].meta.changes)
      throw new AppError("Заказ изменился. Обновите данные.", 409);
  }
}
