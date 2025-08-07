import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ModelItem {
  id: string;
  name: string;
  thumbnailUrl?: string;
  volume?: number;
  uploadedAt?: string;
  price: number; // 💰 price per unit (required now)
  quantity: number; // 📦 quantity (new)
  [key: string]: unknown; // allow flexible metadata
}

interface CartStoreState {
  items: ModelItem[];
  hydrated: boolean;

  addItem: (model: ModelItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  setItemQuantity: (id: string, quantity: number) => void;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,

      addItem: (model: ModelItem) => {
        const existing = get().items.find((i) => i.id === model.id);
        if (!existing) {
          console.debug('[CartStore] Adding model:', model);
          set({
            items: [
              ...get().items,
              {
                ...model,
                quantity: model.quantity ?? 1,
                price: model.price ?? 0,
              },
            ],
          });
        } else {
          console.debug('[CartStore] Model already in cart, increasing quantity:', model.id);
          set({
            items: get().items.map((i) =>
              i.id === model.id
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          });
        }
      },

      removeItem: (id: string) => {
        console.debug('[CartStore] Removing model:', id);
        set({ items: get().items.filter((m) => m.id !== id) });
      },

      clearCart: () => {
        console.warn('[CartStore] Clearing cart');
        set({ items: [] });
      },

      setItemQuantity: (id: string, quantity: number) => {
        if (quantity < 1) quantity = 1;
        console.debug('[CartStore] Setting quantity for', id, 'to', quantity);
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, quantity } : item
          ),
        });
      },
    }),
    {
      name: 'cart-storage',
      onRehydrateStorage: () => () => set({ hydrated: true }),
    }
  )
);
