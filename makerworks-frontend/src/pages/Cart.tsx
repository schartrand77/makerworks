import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleCartCheckout } from '@/lib/checkout';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/ui/PageHeader';
import { useCartStore } from '@/store/useCartStore';
import { ShoppingCart, XCircle, Minus, Plus } from 'lucide-react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function Cart() {
  const { items, setItemQuantity, removeItem, clearCart } = useCartStore();
  const navigate = useNavigate();

  useEffect(() => {
    console.debug('[Cart] Mounted with items:', items);
  }, [items]);

  const handleCheckout = () => {
    console.info('[Cart] Proceed to checkout');
    handleCartCheckout(navigate);
  };

  const subtotal = items.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <PageLayout>
      <div className="space-y-6 flex flex-col items-center w-full">
        <div className="w-full max-w-4xl">
          <PageHeader
            icon={<ShoppingCart className="w-8 h-8 text-zinc-400" />}
            title="Your Cart"
          />
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 w-full max-w-md rounded-2xl bg-white/20 dark:bg-zinc-800/30 shadow-xl backdrop-blur-md border border-white/30">
            <XCircle className="w-12 h-12 text-zinc-400 mb-4" />
            <p className="text-center text-base text-zinc-700 dark:text-zinc-300">
              Your cart is currently empty.
            </p>
          </div>
        ) : (
          <div className="space-y-4 w-full max-w-2xl">
            {items.map((item: CartItem) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white/30 dark:bg-zinc-800/30 backdrop-blur-md p-4 shadow-lg border border-white/20"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100">
                      {item.name}
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      ID: {item.id} • ${item.price.toFixed(2)} each
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() =>
                          setItemQuantity(item.id, Math.max(1, item.quantity - 1))
                        }
                        className="p-1 rounded bg-brand-white/30 hover:bg-brand-white active:bg-brand-blue text-brand-black"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-2 text-zinc-800 dark:text-zinc-100">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => setItemQuantity(item.id, item.quantity + 1)}
                        className="p-1 rounded bg-brand-white/30 hover:bg-brand-white active:bg-brand-blue text-brand-black"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="px-3 py-1 bg-red-500/30 hover:bg-red-500 active:bg-red-600 text-white text-sm rounded-md self-start sm:self-center"
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div className="rounded-2xl bg-white/30 dark:bg-zinc-800/30 backdrop-blur-md p-4 shadow-lg border border-white/20">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
                  Subtotal:{' '}
                  <span className="text-emerald-600">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <button
                    onClick={clearCart}
                    className="px-4 py-2 rounded-md bg-brand-white/30 hover:bg-brand-white active:bg-brand-blue text-brand-black text-sm w-full sm:w-auto"
                  >
                    Clear Cart
                  </button>
                  <button
                    onClick={handleCheckout}
                    className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm w-full sm:w-auto"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
