import { OrderClient } from "@/components/order-client";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderClient orderId={id} />;
}
