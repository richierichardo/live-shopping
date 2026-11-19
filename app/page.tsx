import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { products } from "@/lib/catalog";

export default function HomePage() {
  const featured = products.filter((product) => product.featured).slice(0, 3);
  return (
    <div className="home-page">
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker"><span className="live-dot" /> GOODLUCH RACING GEAR · VOL. 01</p>
          <h1>Race your<br /><em>own way.</em></h1>
          <p className="hero-description">Streetwear made for those who take the long way home. Find your pace. Wear your story.</p>
          <div className="hero-actions"><Link href="/products" className="button button-dark">Explore collection <span>↗</span></Link><Link href="/products/retro-racing-group-black-longsleeve" className="text-link">Try it live <span>◉</span></Link></div>
          <div className="hero-meta"><span>01 / 03</span><span className="hero-rule" /><span>OBSIDIAN BROWN COLLECTION</span></div>
        </div>
        <div className="hero-art">
          <div className="hero-art-label"><span>NEW DROP</span><span>2026 — VOL. 01</span></div>
          <img className="hero-brand-art" src="/images/goodluch-banner-2.webp" alt="Goodluch racing jersey and long sleeve collection" />
          <div className="hero-art-stamp"><span>EST.</span><strong>GL</strong><span>RACING<br />GEAR</span></div>
          <div className="hero-art-caption"><span>01</span><span>OBSIDIAN BROWN<br />JERSEY VOL. 1</span><span>↗</span></div>
        </div>
        <div className="hero-scroll"><span>SCROLL TO EXPLORE</span><i /></div>
      </section>

      <section className="ticker" aria-label="Brand statement"><div className="ticker-track"><span>GOODLUCH RACING GEAR</span><b>✳</b><span>BUILT FOR YOUR OWN LINE</span><b>✳</b><span>GOODLUCH RACING GEAR</span><b>✳</b><span>BUILT FOR YOUR OWN LINE</span></div></section>

      <section className="collection-section wrap">
        <div className="section-heading"><div><p className="eyebrow">THE FIRST LAP</p><h2>Find your<br /><em>starting line.</em></h2></div><p className="section-aside">Everyday staples with the spirit of the track. Made to move at your own pace.</p></div>
        <div className="product-grid home-grid">{featured.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>
        <div className="center-link"><Link href="/products" className="button button-outline">Shop the collection <span>↗</span></Link></div>
      </section>

      <section className="tryon-teaser wrap">
        <div className="tryon-teaser-art"><div className="tryon-teaser-rings" /><img src="/images/tryon-shirt.svg" alt="Illustrated Goodluch shirt preview" /><span className="teaser-tag">LIVE / 01</span></div>
        <div className="tryon-teaser-copy"><p className="eyebrow"><span className="live-dot" /> THE DIGITAL FITTING ROOM</p><h2>See it move<br />with <em>you.</em></h2><p>Try selected pieces live from your camera. A visual preview to explore the look — not a size or fit guarantee.</p><Link href="/products/retro-racing-group-black-longsleeve" className="button button-light">Try the live preview <span>↗</span></Link><small>Camera stays on your device. We don’t record or upload video.</small></div>
      </section>

      <section className="manifesto wrap"><div className="manifesto-left"><span className="manifesto-index">G / 01</span><p className="eyebrow">GOODLUCH CLUB</p></div><div className="manifesto-main"><h2>It’s not about<br />being first.<br /><em>It’s about your line.</em></h2><div className="manifesto-foot"><span>DESIGNED TO MOVE THROUGH LIFE</span><span>— GOODLUCH, BANDUNG</span></div></div></section>
    </div>
  );
}
