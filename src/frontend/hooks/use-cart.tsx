'use client';

import * as React from 'react';
import type { CartItem } from '@/shared/types';

const STORAGE_KEY = 'tr:cart';

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  currency: string;
  addItem: (item: CartItem) => void;
  removeItem: (eventId: string, tierId: string) => void;
  updateQuantity: (eventId: string, tierId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = React.createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  // Read from localStorage only after mount — reading during render would make the
  // server and client markup disagree.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      /* corrupt payload — start with an empty cart */
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = React.useCallback((item: CartItem) => {
    setItems((current) => {
      const index = current.findIndex(
        (i) => i.eventId === item.eventId && i.tierId === item.tierId
      );
      if (index === -1) return [...current, item];
      const next = [...current];
      next[index] = { ...next[index], quantity: next[index].quantity + item.quantity };
      return next;
    });
  }, []);

  const removeItem = React.useCallback((eventId: string, tierId: string) => {
    setItems((current) => current.filter((i) => !(i.eventId === eventId && i.tierId === tierId)));
  }, []);

  const updateQuantity = React.useCallback((eventId: string, tierId: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((i) => !(i.eventId === eventId && i.tierId === tierId))
        : current.map((i) =>
            i.eventId === eventId && i.tierId === tierId ? { ...i, quantity } : i
          )
    );
  }, []);

  const clear = React.useCallback(() => setItems([]), []);

  const value = React.useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return {
      items,
      itemCount: hydrated ? itemCount : 0,
      subtotal,
      currency: items[0]?.currency ?? 'GBP',
      addItem,
      removeItem,
      updateQuantity,
      clear,
    };
  }, [items, hydrated, addItem, removeItem, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = React.useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a <CartProvider>');
  return context;
}
