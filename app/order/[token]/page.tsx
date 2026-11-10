import { notFound } from "next/navigation";
import { repository } from "@/lib/server";
import { AppError } from "@/lib/domain";
import { OrderStatus } from "@/components/order-status";
export const dynamic = "force-dynamic";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    return (
      <OrderStatus
        initial={await repository().publicOrder(token)}
        token={token}
      />
    );
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
