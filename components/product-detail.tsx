"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatRupiah } from "@/lib/catalog";
import { useStore } from "@/components/store-provider";
import { TryOnModal } from "@/components/try-on-modal";

export function ProductDetail({ product }: { product: Product }) {
  const [color, setColor] = useState(product.colors[0]?.name ?? "");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { addToCart } = useStore();
  const variant = product.variants.find((item) => item.color === color && item.size === size);

  const add = (goToCart = false) => {
    if (!variant) {
      setMessage("Pilih ukuran dulu untuk lanjut.");
      return;
    }
    if (variant.stock < 1) {
      setMessage("Ukuran ini sedang habis.");
      return;
    }
    addToCart({ productId: product.id, variantId: variant.id, quantity });
    setMessage("Ditambahkan ke bag. Siap lanjut kapan saja.");
    if (goToCart) window.location.href = "/cart";
  };

  return <div className="product-detail-page wrap">
    <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/products">Shop</Link><span>/</span><span>{product.category}</span></div>
    <div className="product-detail-grid">
      <div className="product-gallery"><div className="gallery-main"><img src={product.images[0]} alt={`${product.name} — front view`} /><span className="gallery-count">01 / 02</span><span className="gallery-tag">GOODLUCH / VOL. 01</span></div><div className="gallery-secondary"><img src={product.images[1]} alt={`${product.name} — collection detail`} /><span>DESIGNED FOR YOUR OWN LINE</span></div></div>
      <aside className="product-buy-panel"><p className="eyebrow">{product.category} · GOODLUCH ORIGINAL</p><h1>{product.name}</h1><div className="product-price-row"><strong>{formatRupiah(product.price)}</strong>{product.compareAt && <del>{formatRupiah(product.compareAt)}</del>}</div><p className="product-description">{product.description}</p><div className="detail-divider" />
        <div className="option-heading"><span>COLOR</span><strong>{color}</strong></div>
        <div className="color-options">{product.colors.map((item) => <button key={item.name} className={`color-option ${color === item.name ? "chosen" : ""}`} onClick={() => { setColor(item.name); setSize(""); setMessage(""); }} aria-label={`Select ${item.name}`} aria-pressed={color === item.name}><span style={{ background: item.hex }} /></button>)}</div>
        <div className="option-heading size-heading"><span>SIZE</span><button className="text-link size-guide-toggle" onClick={() => setSizeGuideOpen(!sizeGuideOpen)} aria-expanded={sizeGuideOpen}>Size guide <span>↗</span></button></div>
        <div className="size-options">{product.sizes.map((item) => { const itemVariant = product.variants.find((candidate) => candidate.color === color && candidate.size === item); const soldOut = !itemVariant || itemVariant.stock === 0; return <button key={item} className={`size-option ${size === item ? "chosen" : ""} ${soldOut ? "sold-out" : ""}`} onClick={() => { setSize(item); setMessage(""); }} aria-pressed={size === item} aria-label={`${item}${soldOut ? ", out of stock" : ""}`}>{item}</button>; })}</div>
        {sizeGuideOpen && <div className="size-guide"><div className="size-guide-head"><span>SIZE</span><span>LENGTH</span><span>WIDTH</span>{product.sizeGuide.some((item) => item.sleeve) && <span>SLEEVE</span>}</div>{product.sizeGuide.map((item) => <div className="size-guide-row" key={item.size}><strong>{item.size}</strong><span>{item.length} cm</span><span>{item.width} cm</span>{product.sizeGuide.some((row) => row.sleeve) && <span>{item.sleeve ?? "—"} cm</span>}</div>)}<small>Ukur baju secara rata. Toleransi produksi ±1–2 cm.</small></div>}
        <div className="qty-row"><span>QUANTITY</span><div className="quantity-stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity">−</button><span>{quantity}</span><button onClick={() => setQuantity(Math.min(9, quantity + 1))} aria-label="Increase quantity">+</button></div><span className="stock-note">{variant ? variant.stock > 0 ? `${variant.stock} in stock` : "Sold out" : "Choose a size"}</span></div>
        <button className="button button-dark add-to-bag" disabled={Boolean(variant && variant.stock === 0)} onClick={() => add()}>{variant?.stock === 0 ? "Sold out" : "Add to bag"}<span>↗</span></button>
        <button className="button button-outline try-on-button" onClick={() => setTryOnOpen(true)}>◎ <span>Try it live</span><small>Visual simulation</small></button>
        {message && <p className="inline-message" role="status">{message}</p>}
        <div className="product-service-notes"><p><span>01</span> Material <b>{product.material}</b></p><p><span>02</span> Delivery <b>Demo estimate at checkout</b></p><p><span>03</span> Preview <b>Visual simulation only</b></p></div>
        <div className="product-disclaimer">Live try-on is a visual simulation only. It is not a size recommendation, not a fitting-room replacement, and does not guarantee fit, fabric drape, or that your current clothes will look fully replaced.</div>
      </aside>
    </div>
    <section className="product-bottom-note"><span>GOODLUCH / MADE TO MOVE</span><p>Choose a piece that feels like <em>your own line.</em></p><Link href="/products">Back to collection ↗</Link></section>
    {tryOnOpen && <TryOnModal product={product} onClose={() => setTryOnOpen(false)} />}
  </div>;
}
