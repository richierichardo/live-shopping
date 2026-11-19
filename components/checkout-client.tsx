"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatRupiah, products } from "@/lib/catalog";
import { useStore } from "@/components/store-provider";
import type { DemoOrder } from "@/lib/order";

export function CheckoutClient() {
  const router = useRouter();
  const { cart, subtotal, saveOrder, clearCart } = useStore();
  const [shipping, setShipping] = useState("Regular · 2–4 hari");
  const [payment, setPayment] = useState("QRIS (demo)");
  const [error, setError] = useState("");
  const shippingCost = subtotal >= 500_000 ? 0 : shipping.startsWith("Express") ? 29_000 : 15_000;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cart.length) { setError("Bag lu masih kosong."); return; }
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    if (!name || !email.includes("@") || !phone || !address || !city) { setError("Lengkapi nama, email valid, nomor HP, alamat, dan kota."); return; }
    const id = `GL-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const order: DemoOrder = {
      id,
      createdAt: new Date().toISOString(),
      status: "processing",
      customer: { name, email, phone },
      address,
      city,
      shipping,
      payment,
      items: cart.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, unitPrice: item.price })),
      subtotal,
      shippingCost,
      total: subtotal + shippingCost,
      demo: true,
    };
    saveOrder(order);
    clearCart();
    router.push(`/order/${id}`);
  };

  return <div className="checkout-page wrap">
    <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/cart">Your bag</Link><span>/</span><span>Checkout demo</span></div>
    <div className="page-title-row"><div><p className="eyebrow">ONE LAST LAP</p><h1>Checkout <em>demo.</em></h1></div><span>NO PAYMENT WILL BE TAKEN</span></div>
    {!cart.length ? <div className="empty-state cart-empty"><span>EMPTY / BAG</span><h2>No items to check out.</h2><p>Add a piece to your bag first.</p><Link className="button button-dark" href="/products">Back to shop <span>↗</span></Link></div> : <form className="checkout-layout" onSubmit={submit} noValidate>
      <div className="checkout-form"><section className="checkout-section"><div className="checkout-section-title"><span>01</span><div><h2>Contact details</h2><p>Used for this local demo order only.</p></div></div><div className="form-grid"><label className="field field-wide"><span>FULL NAME</span><input name="name" autoComplete="name" placeholder="Your name" required /></label><label className="field"><span>EMAIL ADDRESS</span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label><label className="field"><span>PHONE NUMBER</span><input name="phone" type="tel" autoComplete="tel" placeholder="08xx xxxx xxxx" required /></label></div></section>
        <section className="checkout-section"><div className="checkout-section-title"><span>02</span><div><h2>Shipping address</h2><p>Dummy checkout — no courier label is created.</p></div></div><div className="form-grid"><label className="field field-wide"><span>STREET ADDRESS</span><input name="address" autoComplete="street-address" placeholder="Street, number, neighborhood" required /></label><label className="field field-wide"><span>CITY / REGENCY</span><input name="city" autoComplete="address-level2" placeholder="Bandung" required /></label><label className="field"><span>POSTAL CODE</span><input name="postal" autoComplete="postal-code" placeholder="40123" /></label></div></section>
        <section className="checkout-section"><div className="checkout-section-title"><span>03</span><div><h2>Delivery & payment</h2><p>Options below are simulations.</p></div></div><div className="choice-list">{["Regular · 2–4 hari", "Express · 1–2 hari"].map((option) => <label className="choice-card" key={option}><input type="radio" name="shipping" value={option} checked={shipping === option} onChange={() => setShipping(option)} /><span className="radio-dot" /><span>{option}</span><strong>{subtotal >= 500_000 ? "FREE" : formatRupiah(option.startsWith("Express") ? 29_000 : 15_000)}</strong></label>)}</div><div className="payment-options">{["QRIS (demo)", "Bank transfer (demo)", "COD (demo)"].map((option) => <button type="button" key={option} className={payment === option ? "payment-option selected" : "payment-option"} onClick={() => setPayment(option)} aria-pressed={payment === option}>{option}</button>)}</div><p className="demo-notice wide-notice">Payment selection is just a prototype choice. No card or banking details are requested.</p></section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark place-order" type="submit">Create demo order <span>↗</span></button>
      </div>
      <aside className="order-summary checkout-summary"><p className="eyebrow">YOUR ORDER / {cart.length} LINES</p>{cart.map((item) => <div className="checkout-item" key={item.variantId}><img src={item.image} alt="" /><div><strong>{item.name}</strong><span>{item.color} / {item.size} × {item.quantity}</span></div><b>{formatRupiah(item.price * item.quantity)}</b></div>)}<div className="summary-row"><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div><div className="summary-row"><span>Delivery</span><strong>{shippingCost ? formatRupiah(shippingCost) : "FREE"}</strong></div><div className="summary-total"><span>Total</span><strong>{formatRupiah(subtotal + shippingCost)}</strong></div><p className="demo-notice">No actual purchase, payment, or shipment will happen.</p></aside>
    </form>}
  </div>;
}

export function getCartItemProduct(productId: string) { return products.find((product) => product.id === productId); }
