import { notFound } from "next/navigation";
import SalesScreen from "../sales-screen";

export const dynamic = "force-dynamic";

export default async function EstimatePage({ params, searchParams }: {
  params: Promise<{ estimateId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const estimateId = Number((await params).estimateId);
  if (!Number.isSafeInteger(estimateId) || estimateId < 1 || estimateId > 2_147_483_647) notFound();
  return <SalesScreen estimateId={estimateId} tab={(await searchParams).tab} />;
}
