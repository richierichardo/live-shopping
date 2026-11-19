"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/components/store-provider";
import { formatRupiah, products } from "@/lib/catalog";
import type { DemoOrder } from "@/lib/order";

const statusCopy: Record<DemoOrder["status"], { title: string; detail: string }> = {
  paid: { title: "Demo order created", detail: "Payment is simulated for this prototype." },
  processing: { title: "Preparing your pieces", detail: "This is a sample order state; nothing is being packed." },
  shipped: { title: "On the way (demo)", detail: "There is no courier or real tracking number connected." },
  delivered: { title: "Delivered (demo)", detail: "This sample status is only for previewing the tracking UI." },
};

export function OrderClient({ orderId }: { orderId: string }) {
  const { getOrder } = useStore();
  const order = getOrder(orderId);
  const steps = ["Order created", "Processing", "Shipped", "Delivered"];
  const activeIndex = useMemo(() => order ? ["paid", "processing", "shipped", "delivered"].indexOf(order.status) : -1, [order]);
  return <div className="order-page wrap">
    <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><span>Order status</span></div>
    {order ? <><div className="order-confirmation"><div className="success-seal">✓</div><p className="eyebrow">DEMO ORDER / {order.id}</p><h1>Good choice.<br /><em>Next lap soon.</em></h1><p>Your order is saved in this browser as a demo. No payment or shipment has been started.</p><div className="order-status-card"><div className="order-status-head"><div><span className="eyebrow">CURRENT DEMO STATUS</span><h2>{statusCopy[order.status].title}</h2><p>{statusCopy[order.status].detail}</p></div><span className="demo-status-chip">DEMO DATA</span></div><div className="status-track">{steps.map((step, index) => <div className={`status-step ${index <= activeIndex ? "complete" : ""} ${index === activeIndex ? "current" : ""}`} key={step}><span>{index < activeIndex ? "✓" : `0${index + 1}`}</span><b>{step}</b></div>)}</div><div className="tracking-update"><span>LAST UPDATE</span><strong>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</strong><Link href={`/tracking?id=${order.id}`}>View tracking detail ↗</Link></div></div>
      <div className="order-result-actions"><Link href="/products" className="button button-dark">Keep exploring <span>↗</span></Link><Link href="/tracking" className="text-link">Track a demo order <span>↗</span></Link></div></div><aside className="order-receipt"><p className="eyebrow">ORDER SUMMARY / DEMO</p>{order.items.map((item, index) => { const product = products.find((entry) => entry.id === item.productId); const variant = product?.variants.find((entry) => entry.id === item.variantId); return <div className="checkout-item" key={`${item.variantId}-${index}`}><img src={product?.images[0] ?? "/images/product-racing.svg"} alt="" /><div><strong>{product?.name ?? "Goodluch piece"}</strong><span>{variant?.color ?? "Color"} / {variant?.size ?? "Size"} × {item.quantity}</span></div><b>{formatRupiah(item.unitPrice * item.quantity)}</b></div>; })}<div className="summary-row"><span>Subtotal</span><strong>{formatRupiah(order.subtotal)}</strong></div><div className="summary-row"><span>Delivery (demo)</span><strong>{order.shippingCost ? formatRupiah(order.shippingCost) : "FREE"}</strong></div><div className="summary-total"><span>Demo total</span><strong>{formatRupiah(order.total)}</strong></div><p className="demo-notice">This local order is not connected to Goodluch operations.</p></aside></> : <div className="empty-state order-not-found"><span>ORDER / NOT FOUND</span><h2>This demo order is not on this browser.</h2><p>Orders are saved locally. Try the sample tracking number instead.</p><Link className="button button-dark" href="/tracking">Open tracking demo <span>↗</span></Link></div>}
  </div>;
}
