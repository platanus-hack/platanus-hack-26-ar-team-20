'use client';

export type CartProps = {
  title?: string;
  price?: number;
  duration?: string;
};

export default function Control({
  title = '30 Min Meeting',
  price = 49,
  duration = '30 minutes',
}: CartProps) {
  return (
    <section
      data-testid="cart-control"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <header>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{duration}</p>
      </header>

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

      <button
        type="button"
        className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        Confirm booking
      </button>
    </section>
  );
}
