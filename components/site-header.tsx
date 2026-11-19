"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/components/store-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { itemCount } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: "/products", label: "Shop all" },
    { href: "/products?category=Longsleeve", label: "Longsleeve" },
    { href: "/products?category=Jersey", label: "Jersey" },
    { href: "/tracking", label: "Track order" },
  ];

  return (
    <>
      <div className="announcement"><span>Free shipping for orders over Rp500.000</span><span className="announcement-dot" /> <span>Race your own way.</span></div>
      <header className="site-header">
        <button className="icon-button menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <CloseIcon /> : <MenuIcon />}</button>
        <Link href="/" className="wordmark" aria-label="Goodluch home">GOODLUCH<span>®</span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.slice(0, 3).map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>{link.label}</Link>)}
        </nav>
        <div className="header-actions">
          <Link href="/tracking" className="track-link">Track order</Link>
          <Link href="/cart" className="cart-link" aria-label={`Cart, ${itemCount} items`}><BagIcon /><span>Bag</span><b>{itemCount.toString().padStart(2, "0")}</b></Link>
        </div>
      </header>
      {menuOpen && <nav className="mobile-menu" aria-label="Mobile navigation">{links.map((link) => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}<span>↗</span></Link>)}</nav>}
    </>
  );
}

function MenuIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function BagIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>; }
