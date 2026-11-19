import { CatalogClient } from "@/components/catalog-client";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  return <CatalogClient initialCategory={category ?? "All"} />;
}
