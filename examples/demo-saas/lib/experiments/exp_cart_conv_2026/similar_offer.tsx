'use client';
import type { CartProps } from './control';

const OFFERS = [
  { label: '60 Min Deep Dive', price: 89, save: 'Save $9' },
  { label: 'Monthly Coaching (4 sessions)', price: 169, save: 'Save $27' },
] as const;

export default function SimilarOffer({
  title = '30 Min Meeting',
  price = 49,
  duration = '30 minutes',
}: CartProps) {
  return (
    <section
      data-testid="cart-similar-offer"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{duration}</p>

      <dl className="mt-6 space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-slate-600 dark:text-slate-400">Subtotal</dt>
          <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
            ${price.toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
          <dt className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Total
          </dt>
          <dd className="text-base font-semibold text-slate-900 dark:text-slate-100">
            ${price.toFixed(2)}
          </dd>
        </div>
      </dl>

      <div className="mt-6 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          People who booked this also chose
        </p>
        {OFFERS.map((o) => (
          <button
            key={o.label}
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60"
          >
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {o.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                {o.save}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                ${o.price}
              </span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        Confirm booking
      </button>
    </section>
  );
}
