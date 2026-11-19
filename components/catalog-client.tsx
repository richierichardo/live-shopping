"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { categories, products } from "@/lib/catalog";

export function CatalogClient({ initialCategory }: { initialCategory: string }) {
  const [category, setCategory] = useState<string>(categories.includes(initialCategory as (typeof categories)[number]) ? initialCategory : "All");
  const [query, setQuery] = useState("");
  const [size, setSize] = useState("All sizes");
  const [availability, setAvailability] = useState(false);
  const [sort, setSort] = useState("Featured");

  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesQuery = `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase());
      const matchesSize = size === "All sizes" || product.sizes.includes(size);
      const matchesAvailability = !availability || product.variants.some((variant) => variant.stock > 0);
      return matchesCategory && matchesQuery && matchesSize && matchesAvailability;
    });
    if (sort === "Price: low to high") return result.toSorted((a, b) => a.price - b.price);
    if (sort === "Price: high to low") return result.toSorted((a, b) => b.price - a.price);
    return result;
  }, [availability, category, query, size, sort]);

  return <div className="catalog-page wrap">
    <div className="catalog-intro"><div><p className="eyebrow">GOODLUCH / SHOP</p><h1>All the<br /><em>good stuff.</em></h1></div><div className="catalog-intro-copy"><p>Find your pace. Pick your piece.</p><span>Everyday gear for the ones who choose their own line.</span></div></div>
    <div className="catalog-controls">
      <div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="filter-row">
        <label className="search-field"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the collection" aria-label="Search products" /><span>⌘ K</span></label>
        <label className="select-field"><span>SIZE</span><select value={size} onChange={(event) => setSize(event.target.value)} aria-label="Filter by size"><option>All sizes</option>{["M", "L", "XL", "XXL", "3XL"].map((item) => <option key={item}>{item}</option>)}</select><Chevron /></label>
        <label className="select-field"><span>SORT</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products"><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select><Chevron /></label>
        <label className="availability-toggle"><input type="checkbox" checked={availability} onChange={(event) => setAvailability(event.target.checked)} /><span className="toggle-track" /><span>In stock</span></label>
      </div>
    </div>
    <div className="catalog-result-line"><span>{filtered.length} pieces</span><span>COLLECTION / VOL. 01</span></div>
    {filtered.length ? <div className="product-grid catalog-grid">{filtered.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div> : <div className="empty-state"><span>0 / 0</span><h2>No pieces found.</h2><p>Try changing your search or filters.</p><button className="button button-dark" onClick={() => { setQuery(""); setSize("All sizes"); setAvailability(false); setCategory("All"); }}>Reset filters</button></div>}
  </div>;
}

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4 4" /></svg>; }
function Chevron() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>; }
