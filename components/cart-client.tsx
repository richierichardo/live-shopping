"use client";

import Link from "next/link";
import { formatRupiah } from "@/lib/catalog";
import { useStore } from "@/components/store-provider";

export function CartClient() {
  const { cart, subtotal, setQuantity, removeFromCart } = useStore();
  const shipping = subtotal >= 500_000 || subtotal === 0 ? 0 : 15_000;
  return <div className="cart-page wrap">
    <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><span>Your bag</span></div>
    <div className="page-title-row"><div><p className="eyebrow">YOUR GOODLUCH PICKS</p><h1>Your <em>bag.</em></h1></div><span>{cart.length.toString().padStart(2, "0")} LINE ITEMS</span></div>
    {cart.length === 0 ? <div className="empty-state cart-empty"><span>00 / 00</span><h2>Your bag is taking a pit stop.</h2><p>Nothing here yet. Find the piece that feels like your own line.</p><Link className="button button-dark" href="/products">Explore collection <span>↗</span></Link></div> : <div className="cart-layout">
      <section className="cart-lines" aria-label="Items in your bag">{cart.map((item, index) => <article className="cart-line" key={item.variantId}><Link href={`/products/${item.slug}`} className="cart-line-image"><img src={item.image} alt={item.name} /><span>0{index + 1}</span></Link><div className="cart-line-info"><p className="eyebrow">{item.color} · {item.size}</p><Link href={`/products/${item.slug}`} className="cart-line-title">{item.name}</Link><span className="cart-line-stock">{item.stock > 0 ? "Available for demo checkout" : "This mock size is sold out"}</span><button className="remove-link" onClick={() => removeFromCart(item.variantId)}>Remove item</button></div><div className="cart-line-qty"><label htmlFor={`qty-${item.variantId}`}>QTY</label><input id={`qty-${item.variantId}`} type="number" min={1} max={Math.min(item.stock || 9, 9)} value={item.quantity} onChange={(event) => setQuantity(item.variantId, Number(event.target.value))} /></div><strong className="cart-line-price">{formatRupiah(item.price * item.quantity)}</strong></article>)}</section>
      <aside className="order-summary"><p className="eyebrow">SUMMARY / DEMO</p><div className="summary-row"><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div><div className="summary-row"><span>Shipping estimate</span><strong>{shipping ? formatRupiah(shipping) : "FREE"}</strong></div><p className="summary-help">{subtotal >= 500_000 ? "You unlocked free shipping." : `Spend ${formatRupiah(Math.max(0, 500_000 - subtotal))} more for free shipping.`}</p><div className="summary-total"><span>Total</span><strong>{formatRupiah(subtotal + shipping)}</strong></div><Link href="/checkout" className="button button-dark checkout-link">Continue to checkout <span>↗</span></Link><p className="demo-notice">Prototype only. No payment is collected and no real order is sent.</p><Link href="/products" className="text-link">← Keep shopping</Link></aside>
    </div>}
  </div>;
}
