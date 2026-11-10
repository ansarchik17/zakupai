import { api, owner, repository } from "@/lib/server";
import {
  csv,
  procurement,
  paymentLabels,
  paymentStatus,
  statusLabels,
} from "@/lib/domain";
export const GET = api(async (request) => {
  const data = await repository().dashboard(await owner());
  if (!data)
    return Response.json(
      { error: "Нет рабочего пространства" },
      { status: 404 },
    );
  const p = new URL(request.url).searchParams,
    campaign = p.get("campaign") || undefined;
  const rows: (string | number)[][] =
    p.get("type") === "procurement"
      ? [
          [
            "Товар",
            "Цвет",
            "Размер",
            "Заказано, шт.",
            "Полностью оплачено, шт.",
          ],
          ...procurement(data.orders, campaign).map((r) => [
            r.name,
            r.color,
            r.size,
            r.quantity,
            r.paidQuantity,
          ]),
        ]
      : [
          [
            "Заказ",
            "Клиент",
            "Телефон",
            "Закупка",
            "Сумма, ₸",
            "Оплачено, ₸",
            "Оплата",
            "Выполнение",
            "Источник",
            "Дата",
          ],
          ...data.orders
            .filter((o) => !campaign || o.campaign_id === campaign)
            .map((o) => [
              o.number,
              o.customer,
              o.phone,
              data.campaigns.find((c) => c.id === o.campaign_id)?.name || "",
              o.total,
              o.paid,
              paymentLabels[paymentStatus(o.paid, o.total)],
              statusLabels[o.status],
              o.source,
              o.created_at,
            ]),
        ];
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="zakupai-export.csv"',
      "Cache-Control": "no-store",
    },
  });
});
