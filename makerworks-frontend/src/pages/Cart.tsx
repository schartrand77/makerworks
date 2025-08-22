// src/pages/Cart.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { handleCartCheckout } from '@/lib/checkout';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/ui/PageHeader';
import { useCartStore } from '@/store/useCartStore';
import { ShoppingCart, Minus, Plus, Trash2, Loader2, Sparkles, Star } from 'lucide-react';

interface CartItem { id: string; name: string; price: number; quantity: number; }
type Suggestion = { id: string; name: string; blurb?: string; price?: number; thumbnail?: string | null; };

/** LED buttons everywhere; keep sizes/disabled state consistent */
function pillClasses(
  _tone: 'amber' | 'emerald' | 'red' | 'zinc',
  size: 'sm' | 'md' = 'md',
  disabled = false
){
  const sizeCls = size === 'sm' ? 'mw-btn-sm' : 'mw-btn-md';
  const state   = disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer';
  // LED ring + default text color; transparent background so amber rings elsewhere stay amber.
  return ['mw-enter', sizeCls, 'font-medium text-gray-800 dark:text-gray-200', state].join(' ');
}

/** Card shell: keep your amber ring look; add mw-led for button-triggered halo */
function cardClasses(extra = ''){
  return [
    'relative overflow-visible rounded-2xl mw-led',
    'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
    'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none before:opacity-0 hover:before:opacity-100 before:transition-opacity',
    'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
    extra,
  ].join(' ');
}

/** Try the server cart first (session-backed), then client store. */
async function fetchServerCart(): Promise<CartItem[]> {
  const res = await fetch('/api/v1/cart', { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return arr
    .map((it: any) => ({
      id: String(it.id ?? it.model_id ?? crypto.randomUUID()),
      name: String(it.name ?? it.title ?? 'Item'),
      price: Number(it.price ?? it.cost ?? 0),
      quantity: Number(it.quantity ?? it.qty ?? 1),
    }))
    .filter((x) => x.quantity > 0);
}

/** “Popular” suggestions — actually ask for popular; de-dupe and drop items already in cart. */
async function fetchSuggestions(excludeIds: string[] = []): Promise<Suggestion[]> {
  try {
    // Adjust query params to match your API’s contract for “popular”
    const res = await fetch('/api/v1/models?sort=popular&limit=12', { credentials: 'include' });
    if (!res.ok) throw new Error('bad status');
    const models = await res.json();
    const list = Array.isArray(models?.items) ? models.items : Array.isArray(models) ? models : [];

    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const m of list) {
      const id = String(m.id ?? m.model_id ?? crypto.randomUUID());
      if (seen.has(id) || excludeIds.includes(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: String(m.name ?? m.title ?? 'Model'),
        blurb: String(m.description ?? m.subtitle ?? '') || undefined,
        thumbnail: m.thumbnail_url ?? m.image_url ?? null,
        price: Number(m.price ?? m.base_price ?? 0) || undefined,
      });
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    console.info('[suggestions] using fallback list');
    return [
      { id: 'benchy',  name: 'Benchy',       blurb: 'The one and only!',            price: 0 },
      { id: 'calicat', name: 'Cali Cat',     blurb: 'Calibration with attitude',    price: 0 },
      { id: 'xyzcube', name: 'XYZ Cube',     blurb: 'Dimensional sanity check',     price: 0 },
      { id: 'vase',    name: 'Spiral Vase',  blurb: 'Vase mode goodness',           price: 0 },
      { id: 'rook',    name: 'Rook',         blurb: 'Classic print benchmark',      price: 0 },
      { id: 'frog',    name: 'Frog',         blurb: 'A friendly calibration buddy', price: 0 },
    ];
  }
}

export default function Cart(){
  const { items, setItemQuantity, removeItem, clearCart } = useCartStore();
  const navigate = useNavigate();

  const [serverItems, setServerItems] = useState<CartItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<Suggestion[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try{
        const rows = await fetchServerCart();

        // Build exclusion list using whichever cart source will display
        const idsInCart = (items.length ? items : rows).map(i => String(i.id));
        const sugs = await fetchSuggestions(idsInCart);

        if (alive){ setServerItems(rows); setSuggestions(sugs); }
      } finally { if (alive) setLoading(false); }
    })();

    try{
      const raw = localStorage.getItem('mw_recent_models');
      if (raw){
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)){
          setRecent(arr.slice(0, 6).map((m:any)=>({
            id: String(m.id ?? crypto.randomUUID()),
            name: String(m.name ?? 'Model'),
            blurb: m.blurb ?? undefined,
            price: m.price ?? undefined,
            thumbnail: m.thumbnail ?? null,
          })));
        }
      }
    } catch { /* shrug */ }

    return () => { alive = false; };
    // We intentionally don’t include `items` here to keep this an initial-load fetch.
    // If you want it reactive, add `items` to deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayItems: CartItem[] = useMemo(() => (items.length > 0 ? items : serverItems), [items, serverItems]);
  const subtotal = useMemo(() => displayItems.reduce((t,i)=> t + i.price * i.quantity, 0), [displayItems]);

  const handleCheckout = () => { handleCartCheckout(navigate); };

  return (
    <PageLayout>
      <div className="space-y-6 flex flex-col items-center w-full">
        <div className="w-full max-w-5xl">
          <PageHeader icon={<ShoppingCart className="w-8 h-8 text-zinc-400" />} title="Your Cart" />
        </div>

        {loading ? (
          <div className="w-full max-w-md p-8 text-center">
            <div className={cardClasses('p-8')}>
              <Loader2 className="w-6 h-6 text-zinc-400 mx-auto mb-3" aria-hidden />
              <p className="text-base text-zinc-700 dark:text-zinc-300">Loading your cart…</p>
            </div>
          </div>
        ) : displayItems.length === 0 ? (
          <>
            {/* Empty-state hero */}
            <div className="w-full max-w-5xl">
              <div className={cardClasses('p-8 sm:p-10 overflow-hidden')}>
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles className="w-5 h-5 text-amber-500/80" />
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Your cart is currently empty
                  </h2>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
                  Warm it up with a few models—try one of these popular starters.
                </p>
                <Link to="/browse" className="mw-enter mw-btn-md font-semibold text-gray-800 dark:text-gray-200 inline-flex">
                  Browse models
                </Link>
              </div>
            </div>

            {/* Popular suggestions — identical viewer/halo as Browse */}
            {suggestions.length > 0 && (
              <section className="w-full max-w-5xl">
                <div className="mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500/80" />
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Popular right now</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {suggestions.map((s) => (
                    <article key={`sugg-${s.id}`} className={cardClasses('p-4')}>
                      <div className="mw-thumb aspect-[4/3] rounded-xl mb-3 bg-zinc-900 dark:bg-zinc-900">
                        <div className="mw-thumb-frame w-full h-full flex items-center justify-center">
                          {s.thumbnail ? (
                            <img src={s.thumbnail} alt={`${s.name} preview`} className="mw-thumb-img" loading="lazy" />
                          ) : (
                            <div className="text-zinc-400 text-sm">Preview</div>
                          )}
                        </div>
                      </div>

                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.name}</h4>
                      {s.blurb && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-2">{s.blurb}</p>}

                      <div className="mt-3 flex gap-2">
                        <Link to={`/browse`} className="mw-enter mw-btn-sm text-gray-800 dark:text-gray-200 inline-flex">
                          View details
                        </Link>
                        <Link to={`/estimate`} state={{ modelId: s.id }} className="mw-enter mw-btn-sm text-gray-800 dark:text-gray-200 inline-flex">
                          Get estimate
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Recently viewed (left as-is) */}
            {recent.length > 0 && (
              <section className="w-full max-w-5xl">
                <div className="mt-8 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Recently viewed</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {recent.map((r) => (
                    <Link key={`rec-${r.id}`} to="/browse" className={cardClasses('p-3 hover:before:opacity-100')} title={r.name}>
                      <div className="aspect-square rounded-lg bg-white/50 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10 mb-2 grid place-items-center overflow-hidden">
                        {r.thumbnail ? (
                          <img src={r.thumbnail} alt={`${r.name} preview`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-zinc-400 text-xs">Preview</div>
                        )}
                      </div>
                      <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{r.name}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          /* Filled cart */
          <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items list */}
            <div className="lg:col-span-2 space-y-4">
              {displayItems.map((item) => {
                const lineTotal = item.price * item.quantity;
                const clientBacked = items.length > 0;

                return (
                  <div key={`${item.id}-${item.name}`} className={cardClasses('p-4 sm:p-5')}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100 truncate">{item.name}</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
                          ID: <span className="font-mono">{item.id}</span> • ${item.price.toFixed(2)} each
                        </p>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => clientBacked && setItemQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className={pillClasses('zinc', 'sm', !clientBacked)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            disabled={!clientBacked}
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          <span className="min-w-[2.5rem] text-center text-zinc-900 dark:text-zinc-100">{item.quantity}</span>

                          <button
                            onClick={() => clientBacked && setItemQuantity(item.id, item.quantity + 1)}
                            className={pillClasses('amber', 'sm', !clientBacked)}
                            aria-label={`Increase quantity of ${item.name}`}
                            disabled={!clientBacked}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {!clientBacked && (
                          <p className="mt-2 text-xs text-zinc-500">
                            Server cart loaded. Quantity changes are disabled here—proceed to checkout or add via UI that pushes to the client cart.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-3 sm:gap-2">
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Line Total</div>
                          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">${lineTotal.toFixed(2)}</div>
                        </div>

                        <button
                          onClick={() => clientBacked && removeItem(item.id)}
                          className={pillClasses('red', 'sm', !clientBacked)}
                          aria-label={`Remove ${item.name}`}
                          title={clientBacked ? 'Remove from cart' : 'Remove disabled for server-loaded items'}
                          disabled={!clientBacked}
                        >
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <aside className="space-y-4">
              <div className={cardClasses('p-5')}>
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-3">Order Summary</h3>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Items</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{displayItems.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Subtotal</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Taxes &amp; shipping</span>
                    <span className="text-zinc-900 dark:text-zinc-100">Calculated at checkout</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={clearCart}
                    className={pillClasses('zinc', 'md', items.length === 0)}
                    aria-label="Clear cart"
                    title="Remove all items"
                    disabled={items.length === 0}
                  >
                    Clear Cart
                  </button>

                  <button
                    onClick={handleCheckout}
                    className="mw-enter mw-btn-md font-semibold text-gray-800 dark:text-gray-200"
                    aria-label="Proceed to checkout"
                    title="Proceed to checkout"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>

              <div className={cardClasses('p-4')}>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Need a custom quote, special material, or rush order? Add notes on the checkout page or contact us
                  after placing your order—we’ll adjust before printing.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
