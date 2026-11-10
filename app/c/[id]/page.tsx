import { notFound } from "next/navigation";
import { repository } from "@/lib/server";
import { AppError } from "@/lib/domain";
import { Shop } from "@/components/shop";
export const dynamic = "force-dynamic";
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <Shop {...await repository().shop((await params).id)} />;
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
