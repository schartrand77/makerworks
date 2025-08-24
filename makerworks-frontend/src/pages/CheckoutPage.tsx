// src/pages/CheckoutPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

// If you already have these in your API layer, great. Otherwise, stub or wire them.
import { getMe, getCart, createCheckoutSession } from '@/api/checkout';

// NEW: keep title consistent with the rest of the app
import PageHeader from '@/components/ui/PageHeader';
import { CreditCard } from 'lucide-react';

type CheckoutItem = {
  name: string;
  cost: number;
  quantity?: number;
  image_url?: string | null;
};

type ContactForm = {
  fullName: string;
  email: string;
  phone?: string;
};

type DeliveryForm = {
  method: 'pickup' | 'ship';
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
};

const fmt = (n: number, ccy: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy.toUpperCase() as any }).format(n);

export default function CheckoutPage() {
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any | null>(null);

  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [currency, setCurrency] = useState<'usd' | 'cad' | 'eur'>('usd');

  const [contact, setContact] = useState<ContactForm>({ fullName: '', email: '' });
  const [delivery, setDelivery] = useState<DeliveryForm>({ method: 'pickup' });
  const [promo, setPromo] = useState('');
  const [note, setNote] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await getMe().catch(() => null);
        const resolved = u ?? user ?? null;
        setMe(resolved);

        const cart = await getCart().catch(() => null);
        if (cart?.items?.length) {
          setItems(cart.items);
        } else {
          // Fallback sample so the page doesn’t look empty during wiring.
          setItems([
            { name: 'Custom 3D Print (Model A)', cost: 24.0 },
            { name: 'PLA Filament – Black (1kg)', cost: 19.5 },
          ]);
        }

        if (resolved?.email) setContact((c) => ({ ...c, email: resolved.email }));
        if (resolved?.name) setContact((c) => ({ ...c, fullName: resolved.name }));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.cost) || 0) * (it.quantity ?? 1), 0),
    [items]
  );

  const discount = useMemo(() => (promo.trim().toUpperCase() === 'MAKER10' ? 0.1 * subtotal : 0), [promo, subtotal]);

  const taxRate = useMemo(() => (currency === 'cad' ? 0.13 : currency === 'eur' ? 0.2 : 0.07), [currency]);
  const tax = useMemo(() => Math.max(0, (subtotal - discount) * taxRate), [subtotal, discount, taxRate]);

  const total = useMemo(() => Math.max(0, subtotal - discount + tax), [subtotal, discount, tax]);

  function validate(): string | null {
    if (!me) return 'Please sign in to checkout.';
    if (items.length === 0) return 'Your cart is empty.';
    if (!contact.fullName.trim()) return 'Please enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) return 'Please enter a valid email.';
    if (delivery.method === 'ship') {
      if (!delivery.address1?.trim()) return 'Shipping address is required.';
      if (!delivery.city?.trim()) return 'City is required.';
      if (!delivery.region?.trim()) return 'Region/State is required.';
      if (!delivery.postal?.trim()) return 'Postal code is required.';
      if (!delivery.country?.trim()) return 'Country is required.';
    }
    if (!acceptTerms) return 'Please accept the terms to continue.';
    return null;
  }

  async function handlePay() {
    setSubmitting(true);
    setError(null);
    try {
      const v = validate();
      if (v) {
        setError(v);
        setSubmitting(false);
        return;
      }

      const payload = {
        description: note || '3D print order',
        currency,
        total_cost: Number(total.toFixed(2)),
        items,
        metadata: {
          contact_full_name: contact.fullName,
          contact_email: contact.email,
          contact_phone: contact.phone || '',
          delivery_method: delivery.method,
          address1: delivery.address1 || '',
          address2: delivery.address2 || '',
          city: delivery.city || '',
          region: delivery.region || '',
          postal: delivery.postal || '',
          country: delivery.country || '',
          promo: promo.trim() || '',
          note: note.trim() || '',
        },
      };

      const { url } = await createCheckoutSession(payload);
      if (typeof url === 'string' && url.startsWith('http')) {
        window.location.assign(url); // Stripe Checkout
      } else {
        throw new Error('Checkout session did not return a redirect URL.');
      }
    } catch (e: any) {
      setError(e?.message || 'Checkout failed');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="animate-pulse text-sm text-neutral-500">Loading your checkout…</div>
      </div>
    );
  }

  if (!me) {
    // Signed-out prompt — amber-rimmed card + shared LED pill
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div
          className={[
            'relative overflow-visible rounded-2xl mw-led',
            'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
            'border border-amber-300/45 ring-1 ring-amber-300/40',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
            'p-6',
          ].join(' ')}
        >
          <h1 className="text-xl font-semibold mb-2">Please sign in</h1>
          <p className="text-neutral-600 dark:text-neutral-300 mb-5">You need an account to complete your purchase.</p>
          <Link to="/signin" className="mw-btn mw-btn-md font-medium">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* CONSISTENT TITLE */}
      <PageHeader icon={<CreditCard className="w-8 h-8 text-zinc-400" />} title="Checkout" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact */}
          <section
            className={[
              'relative overflow-visible rounded-2xl mw-led',
              'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
              'border border-amber-300/45 ring-1 ring-amber-300/40',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
              'p-6',
            ].join(' ')}
          >
            <h2 className="text-lg font-medium mb-4">Contact</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Full name</label>
                <input
                  className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                  value={contact.fullName}
                  onChange={(e) => setContact({ ...contact, fullName: e.target.value })}
                  placeholder="Jane Maker"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm mb-1">Phone (optional)</label>
                <input
                  className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                  value={contact.phone ?? ''}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                />
              </div>
            </div>
          </section>

          {/* Delivery */}
          <section
            className={[
              'relative overflow-visible rounded-2xl mw-led',
              'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
              'border border-amber-300/45 ring-1 ring-amber-300/40',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
              'p-6',
            ].join(' ')}
          >
            <h2 className="text-lg font-medium mb-4">Delivery</h2>

            <div className="flex gap-3 mb-4">
              <button
                type="button"
                onClick={() => setDelivery((d) => ({ ...d, method: 'pickup' }))}
                aria-pressed={delivery.method === 'pickup'}
                className="mw-btn mw-btn-sm font-medium"
              >
                Pick up
              </button>

              <button
                type="button"
                onClick={() => setDelivery((d) => ({ ...d, method: 'ship' }))}
                aria-pressed={delivery.method === 'ship'}
                className="mw-btn mw-btn-sm font-medium"
              >
                Ship to me
              </button>
            </div>

            {delivery.method === 'ship' && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm mb-1">Address line 1</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                    value={delivery.address1 ?? ''}
                    onChange={(e) => setDelivery({ ...delivery, address1: e.target.value })}
                    placeholder="123 Maker St."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm mb-1">Address line 2 (optional)</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                    value={delivery.address2 ?? ''}
                    onChange={(e) => setDelivery({ ...delivery, address2: e.target.value })}
                    placeholder="Unit, suite, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">City</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                    value={delivery.city ?? ''}
                    onChange={(e) => setDelivery({ ...delivery, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Region / State</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                    value={delivery.region ?? ''}
                    onChange={(e) => setDelivery({ ...delivery, region: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Postal code</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                    value={delivery.postal ?? ''}
                    onChange={(e) => setDelivery({ ...delivery, postal: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Country</label>
                  <input
                    className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                    value={delivery.country ?? ''}
                    onChange={(e) => setDelivery({ ...delivery, country: e.target.value })}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Notes */}
          <section
            className={[
              'relative overflow-visible rounded-2xl mw-led',
              'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
              'border border-amber-300/45 ring-1 ring-amber-300/40',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
              'p-6',
            ].join(' ')}
          >
            <h2 className="text-lg font-medium mb-4">Notes</h2>
            <textarea
              rows={4}
              className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know about your print?"
            />
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              I accept the Terms and Refund Policy.
            </label>
          </section>
        </div>

        {/* RIGHT: Summary */}
        <aside className="space-y-6">
          <section
            className={[
              'relative overflow-visible rounded-2xl mw-led',
              'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
              'border border-amber-300/45 ring-1 ring-amber-300/40',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
              'p-6',
            ].join(' ')}
          >
            <h2 className="text-lg font-medium mb-4">Order summary</h2>

            <ul className="space-y-3 mb-4">
              {items.map((it, idx) => (
                <li key={`${it.name}-${idx}`} className="flex items-center justify-between">
                  <span className="text-sm">{it.name}</span>
                  <span className="text-sm font-medium">
                    {fmt((it.quantity ?? 1) * (Number(it.cost) || 0), currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 mb-4">
              <input
                className="flex-1 rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                placeholder="Promo code"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
              />
              <select
                className="rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
              >
                <option value="usd">USD</option>
                <option value="cad">CAD</option>
                <option value="eur">EUR</option>
              </select>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{fmt(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span className="text-emerald-600">- {fmt(discount, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{fmt(tax, currency)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/30 dark:border-white/10">
                <span className="font-medium">Total</span>
                <span className="font-semibold">{fmt(total, currency)}</span>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handlePay}
              disabled={submitting}
              className="mt-6 w-full mw-btn mw-btn-md font-semibold"
            >
              {submitting ? 'Creating session…' : 'Pay with Stripe'}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
