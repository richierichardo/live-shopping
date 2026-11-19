import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { formatRupiah } from "@/lib/catalog";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  return (
    <article className="product-card" style={{ "--card-delay": `${index * 55}ms` } as React.CSSProperties}>
      <Link href={`/products/${product.slug}`} className={`product-image product-image-${product.id}`} aria-label={`View ${product.name}`}>
        <img src={product.images[0]} alt={product.name} loading={index > 2 ? "lazy" : "eager"} />
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <span className="product-view">View product <b>↗</b></span>
      </Link>
      <div className="product-card-info"><div><p className="eyebrow">{product.category}</p><Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link></div><strong>{formatRupiah(product.price)}</strong></div>
      <div className="product-card-footer"><div className="swatch-row">{product.colors.map((color) => <span key={color.name} title={color.name} className="swatch" style={{ backgroundColor: color.hex }} />)}</div><span>XS — 3XL</span></div>
    </article>
  );
}
