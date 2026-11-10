import { Repository } from "./repository.ts";
import type { Database } from "./repository.ts";

export async function seedDemo(db: Database, owner: string) {
  const repo = new Repository(db),
    w = await repo.requireWorkspace(owner);
  if (!w.is_demo) return;
  const campaignId = crypto.randomUUID(),
    time = new Date().toISOString();
  const added = await db
    .prepare(
      "INSERT INTO campaigns (id,workspace_id,name,supplier,closes_at,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM campaigns WHERE workspace_id=?)",
    )
    .bind(
      campaignId,
      w.id,
      "Новая коллекция",
      "Поставщик из примера",
      new Date(Date.now() + 7 * 86400000).toISOString(),
      time,
      w.id,
    )
    .run();
  if (!added.meta.changes) return;
  const samples = [
    {
      name: "Кроссовки Everyday",
      description:
        "Лёгкая пара на каждый день. Перед заказом сверьтесь со своей привычной размерной сеткой.",
      price: 14500,
      sizes: ["36", "37", "38", "39", "40"],
      colors: ["Белый", "Бежевый"],
      image: "/products/sneakers.jpg",
    },
    {
      name: "Джемпер мягкой вязки",
      description:
        "Свободный силуэт и мягкая фактура. Базовая вещь для прохладных дней.",
      price: 12900,
      sizes: ["S", "M", "L", "XL"],
      colors: ["Молочный", "Серый"],
      image: "/products/sweater.jpg",
    },
    {
      name: "Сумка на каждый день",
      description: "Компактная модель с регулируемым ремнём. Один размер.",
      price: 18900,
      sizes: ["Единый"],
      colors: ["Чёрный", "Коричневый"],
      image: "/products/bag.jpg",
    },
    {
      name: "Куртка свободного кроя",
      description:
        "Модель для многослойных образов. Размер и цвет фиксируются в заказе.",
      price: 28500,
      sizes: ["S", "M", "L", "XL"],
      colors: ["Чёрный"],
      image: "/products/jacket.jpg",
    },
    {
      name: "Джинсы прямого кроя",
      description: "Прямой силуэт. Выберите размер перед оформлением заказа.",
      price: 16900,
      sizes: ["26", "27", "28", "29", "30"],
      colors: ["Синий"],
      image: "/products/jeans.jpg",
    },
  ];
  const ids = [];
  for (const p of samples)
    ids.push(await repo.createProduct(owner, { campaignId, ...p }));
  for (let i = 0; i < 12; i++) {
    const p = samples[i % samples.length],
      quantity = i === 0 || i === 7 ? 2 : 1;
    const order = await repo.createOrder(
      {
        campaignId,
        customer: `Покупатель ${String(i + 1).padStart(2, "0")}`,
        phone: `7000000${String(i + 1).padStart(4, "0")}`,
        comment: i === 1 ? "Пожалуйста, сообщите, когда можно забрать" : "",
        consent: true,
        idempotencyKey: crypto.randomUUID(),
        items: [
          {
            productId: ids[i % samples.length],
            size: p.sizes[i % p.sizes.length],
            color: p.colors[i % p.colors.length],
            quantity,
          },
        ],
      },
      i % 3 === 0 ? owner : undefined,
    );
    if (i % 3 !== 1)
      await repo.pay(owner, order.id, {
        amount: i === 2 ? 5000 : p.price * quantity,
        idempotencyKey: crypto.randomUUID(),
      });
    if (i === 4 || i === 7) await repo.reportPayment(order.token);
    if (i >= 8) {
      await repo.setOrderStatus(owner, order.id, {
        status: "purchased",
        expectedStatus: "new",
      });
      if (i >= 10)
        await repo.setOrderStatus(owner, order.id, {
          status: "received",
          expectedStatus: "purchased",
        });
    }
    await db
      .prepare("UPDATE orders SET created_at=? WHERE id=?")
      .bind(new Date(Date.now() - i * 3600000).toISOString(), order.id)
      .run();
  }
}
