"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { products } from "@/lib/catalog";
import type { CartItemView, CartLine, DemoOrder } from "@/lib/order";

type StoreContextValue = {
  cart: CartItemView[];
  itemCount: number;
  subtotal: number;
  addToCart: (line: CartLine) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  saveOrder: (order: DemoOrder) => void;
  getOrder: (id: string) => DemoOrder | undefined;
  latestOrder?: DemoOrder;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const CART_KEY = "goodluch-demo-cart-v1";
const ORDER_KEY = "goodluch-demo-orders-v1";

function toItemView(line: CartLine): CartItemView | null {
  const product = products.find((item) => item.id === line.productId);
  const variant = product?.variants.find((item) => item.id === line.variantId);
  if (!product || !variant) return null;
  return {
    ...line,
    name: product.name,
    slug: product.slug,
    image: product.images[0],
    price: product.price,
    color: variant.color,
    size: variant.size,
    stock: variant.stock,
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLines(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"));
      setOrders(JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]"));
    } catch {
      setLines([]);
      setOrders([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(CART_KEY, JSON.stringify(lines));
  }, [lines, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  }, [orders, ready]);

  const addToCart = useCallback((line: CartLine) => {
    setLines((current) => {
      const existing = current.find((item) => item.variantId === line.variantId);
      if (!existing) return [...current, line];
      return current.map((item) =>
        item.variantId === line.variantId
          ? { ...item, quantity: Math.min(item.quantity + line.quantity, 9) }
          : item,
      );
    });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((current) => current.filter((item) => item.variantId !== variantId));
      return;
    }
    setLines((current) => current.map((item) => item.variantId === variantId ? { ...item, quantity: Math.min(quantity, 9) } : item));
  }, []);

  const removeFromCart = useCallback((variantId: string) => {
    setLines((current) => current.filter((item) => item.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);
  const saveOrder = useCallback((order: DemoOrder) => setOrders((current) => [order, ...current]), []);
  const getOrder = useCallback((id: string) => orders.find((order) => order.id.toLowerCase() === id.toLowerCase()), [orders]);

  const cart = useMemo(() => lines.map(toItemView).filter((item): item is CartItemView => item !== null), [lines]);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const value = useMemo(() => ({ cart, itemCount, subtotal, addToCart, setQuantity, removeFromCart, clearCart, saveOrder, getOrder, latestOrder: orders[0] }), [cart, itemCount, subtotal, addToCart, setQuantity, removeFromCart, clearCart, saveOrder, getOrder, orders]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
