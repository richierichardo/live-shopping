"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import type { DemoOrder } from "@/lib/order";

const sampleOrder: DemoOrder = {
  id: "GL-DEMO-001",
  createdAt: "2026-11-09T08:35:00.000Z",
  status: "shipped",
  customer: { name: "Demo Customer", email: "demo@example.com", phone: "080000000000" },
  address: "Demo address",
  city: "Bandung",
  shipping: "Regular · 2–4 hari",
  payment: "QRIS (demo)",
  items: [],
  subtotal: 350_000,
  shippingCost: 15_000,
  total: 365_000,
  demo: true,
};

const statuses: { key: DemoOrder["status"]; title: string; detail: string; stamp: string }[] = [
  { key: "paid", title: "Order confirmed", detail: "Demo order has been created.", stamp: "09 Nov · 15:35 WIB" },
  { key: "processing", title: "Being prepared", detail: "Your piece is in the demo packing queue.", stamp: "09 Nov · 16:10 WIB" },
  { key: "shipped", title: "On its way", detail: "A sample parcel update for the tracking preview.", stamp: "10 Nov · 09:20 WIB" },
  { key: "delivered", title: "Delivered", detail: "This is a sample final status.", stamp: "11 Nov · 11:45 WIB" },
];

export function TrackingClient() {
  const searchParams = useSearchParams();
  const { getOrder, latestOrder } = useStore();
  const [query, setQuery] = useState(searchParams.get("id") ?? latestOrder?.id ?? "");
  const [result, setResult] = useState<DemoOrder | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!query && latestOrder) setQuery(latestOrder.id);
  }, [latestOrder, query]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearched(true);
    const normalized = query.trim().toLowerCase();
    setResult(normalized === sampleOrder.id.toLowerCase() ? sampleOrder : getOrder(query.trim()) ?? null);
  };

  return <div className="tracking-page wrap">
    <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><span>Tracking demo</span></div>
    <div className="tracking-heading"><p className="eyebrow">GOODLUCH / AFTER THE GREEN FLAG</p><h1>Where’s your<br /><em>piece?</em></h1><p>Look up a locally saved demo order. No courier data is connected.</p></div>
    <form className="tracking-search" onSubmit={search}><label htmlFor="tracking-id">ORDER NUMBER</label><div><input id="tracking-id" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try GL-DEMO-001" /><button className="button button-dark" type="submit">Find order <span>↗</span></button></div><small>Use GL-DEMO-001 to preview a sample tracking timeline.</small></form>
    {searched && !result && <div className="tracking-empty" role="status"><span>NO MATCH / DEMO DATA</span><p>We couldn’t find that order in this browser. Try the sample order number above or create a demo checkout.</p><Link href="/products">Start a demo order ↗</Link></div>}
    {result && <section className="tracking-result"><div className="tracking-result-head"><div><p className="eyebrow">TRACKING RESULT / DEMO</p><h2>{result.id}</h2></div><span className="demo-status-chip">SIMULATED · {result.status.toUpperCase()}</span></div><p className="tracking-source"><span className="live-dot" /> Demo status · Last updated 10 Nov 2026, 09:20 WIB</p><div className="tracking-timeline">{statuses.map((status, index) => { const currentIndex = ["paid", "processing", "shipped", "delivered"].indexOf(result.status); const done = index <= currentIndex; return <article className={`timeline-item ${done ? "done" : ""} ${index === currentIndex ? "is-current" : ""}`} key={status.key}><span className="timeline-marker">{done ? "✓" : `0${index + 1}`}</span><div><div className="timeline-title-row"><h3>{status.title}</h3><time>{status.stamp}</time></div><p>{status.detail}</p></div></article>; })}</div><div className="tracking-warning">This timeline is generated from mock data for the prototype. It does not represent an actual parcel or courier scan.</div></section>}
  </div>;
}
