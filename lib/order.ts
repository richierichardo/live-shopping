import type { ProductVariant } from "./catalog";

export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type DemoOrder = {
  id: string;
  createdAt: string;
  status: "paid" | "processing" | "shipped" | "delivered";
  customer: { name: string; email: string; phone: string };
  address: string;
  city: string;
  shipping: string;
  payment: string;
  items: { productId: string; variantId: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  shippingCost: number;
  total: number;
  demo: true;
};

export type CartItemView = CartLine & {
  name: string;
  slug: string;
  image: string;
  price: number;
  color: string;
  size: string;
  stock: number;
};

export type CartVariant = ProductVariant;
